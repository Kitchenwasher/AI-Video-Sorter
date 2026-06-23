import socket
import struct
import threading
import time
import hmac
import hashlib
import base64
import logging
import urllib.request
import re
import xml.etree.ElementTree as ET

logger = logging.getLogger("turn_server")
logger.setLevel(logging.INFO)

# Message types
STUN_BINDING_REQUEST = 0x0001
STUN_BINDING_RESPONSE = 0x0101
TURN_ALLOCATE_REQUEST = 0x0003
TURN_ALLOCATE_RESPONSE = 0x0103
TURN_ALLOCATE_ERROR = 0x0113
TURN_REFRESH_REQUEST = 0x0004
TURN_REFRESH_RESPONSE = 0x0104
TURN_CREATE_PERMISSION_REQUEST = 0x0008
TURN_CREATE_PERMISSION_RESPONSE = 0x0108
TURN_CHANNEL_BIND_REQUEST = 0x0009
TURN_CHANNEL_BIND_RESPONSE = 0x0109
TURN_SEND_INDICATION = 0x0016
TURN_DATA_INDICATION = 0x0017

# Attribute types
ATTR_MAPPED_ADDRESS = 0x0001
ATTR_USERNAME = 0x0006
ATTR_MESSAGE_INTEGRITY = 0x0008
ATTR_ERROR_CODE = 0x0009
ATTR_LIFETIME = 0x000d
ATTR_XOR_PEER_ADDRESS = 0x0012
ATTR_DATA = 0x0013
ATTR_REALM = 0x0014
ATTR_NONCE = 0x0015
ATTR_XOR_MAPPED_ADDRESS = 0x0020
ATTR_XOR_RELAYED_ADDRESS = 0x0016
ATTR_REQUESTED_TRANSPORT = 0x0019

# Cache variable for public IP to avoid hammering services
_cached_public_ip = None
_cached_ip_time = 0

def get_public_ip():
    """Auto-detects the public IP address of this machine with local caching."""
    global _cached_public_ip, _cached_ip_time
    now = time.time()
    if _cached_public_ip and (now - _cached_ip_time < 3600):
        return _cached_public_ip

    apis = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://ipinfo.io/ip",
        "https://icanhazip.com"
    ]
    for url in apis:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3) as response:
                ip = response.read().decode('utf-8').strip()
                if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
                    _cached_public_ip = ip
                    _cached_ip_time = now
                    return ip
        except Exception as e:
            logger.debug(f"Failed to fetch public IP from {url}: {e}")
    return None

def get_local_ip():
    """Gets the local LAN IP address of this machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def discover_upnp_gateway():
    """SSDP M-SEARCH to discover the router IGD."""
    ssdp_msg = (
        'M-SEARCH * HTTP/1.1\r\n'
        'HOST: 239.255.255.250:1900\r\n'
        'MAN: "ssdp:discover"\r\n'
        'MX: 2\r\n'
        'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n'
        '\r\n'
    )
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(2.0)
    try:
        sock.sendto(ssdp_msg.encode('utf-8'), ('239.255.255.250', 1900))
        for _ in range(5):
            data, addr = sock.recvfrom(4096)
            response = data.decode('utf-8', errors='ignore')
            match = re.search(r'(?i)LOCATION:\s*([^\r\n]+)', response)
            if match:
                return match.group(1).strip()
    except Exception:
        pass
    finally:
        sock.close()
    return None

def get_upnp_control_url(location):
    """Fetches root desc and extracts control URL."""
    try:
        req = urllib.request.Request(location, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            xml_desc = resp.read()
        root = ET.fromstring(xml_desc)
        ns = {'ns': 'urn:schemas-upnp-org:device-1-0'}
        for service in root.findall('.//ns:service', namespaces=ns):
            service_type = service.find('ns:serviceType', namespaces=ns)
            if service_type is not None and ('WANIPConnection:' in service_type.text or 'WANPPPConnection:' in service_type.text):
                control_url = service.find('ns:controlURL', namespaces=ns).text
                from urllib.parse import urljoin
                return urljoin(location, control_url), service_type.text
    except Exception:
        pass
    return None, None

def add_upnp_port_mapping(external_port, internal_port, internal_ip, protocol='UDP'):
    """Performs the SOAP UPnP request to map ports."""
    try:
        location = discover_upnp_gateway()
        if not location:
            return False, "No UPnP IGD discovered."
        control_url, service_type = get_upnp_control_url(location)
        if not control_url:
            return False, "Could not find WANIPConnection or WANPPPConnection service."
        
        soap_body = (
            f'<?xml version="1.0"?>\n'
            f'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n'
            f'  <s:Body>\n'
            f'    <u:AddPortMapping xmlns:u="{service_type}">\n'
            f'      <NewRemoteHost></NewRemoteHost>\n'
            f'      <NewExternalPort>{external_port}</NewExternalPort>\n'
            f'      <NewProtocol>{protocol}</NewProtocol>\n'
            f'      <NewInternalPort>{internal_port}</NewInternalPort>\n'
            f'      <NewInternalClient>{internal_ip}</NewInternalClient>\n'
            f'      <NewEnabled>1</NewEnabled>\n'
            f'      <NewPortMappingDescription>Antigravity WebRTC TURN Server</NewPortMappingDescription>\n'
            f'      <NewLeaseDuration>0</NewLeaseDuration>\n'
            f'    </u:AddPortMapping>\n'
            f'  </s:Body>\n'
            f'</s:Envelope>\n'
        )
        headers = {
            'Content-Type': 'text/xml; charset="utf-8"',
            'SOAPAction': f'"{service_type}#AddPortMapping"',
        }
        req = urllib.request.Request(
            control_url,
            data=soap_body.encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return True, f"Successfully mapped port {external_port} -> {internal_ip}:{internal_port} ({protocol})"
    except Exception as e:
        return False, str(e)

def decode_xor_address(data, transaction_id):
    if len(data) < 8:
        return None
    reserved, family, x_port, x_ip = struct.unpack('!BBHI', data[:8])
    if family != 1:
        return None
    magic_cookie = 0x2112A442
    port = x_port ^ (magic_cookie >> 16)
    ip_int = x_ip ^ magic_cookie
    ip = socket.inet_ntoa(struct.pack('!I', ip_int))
    return ip, port

def encode_xor_address(ip, port):
    magic_cookie = 0x2112A442
    x_port = port ^ (magic_cookie >> 16)
    ip_bytes = socket.inet_aton(ip)
    ip_int = struct.unpack('!I', ip_bytes)[0]
    x_ip = ip_int ^ magic_cookie
    return struct.pack('!BBHI', 0, 1, x_port, x_ip)

def parse_stun_message(data):
    if len(data) < 20:
        return None
    msg_type, msg_len, magic = struct.unpack('!HHI', data[:8])
    transaction_id = data[8:20]
    if magic != 0x2112A442:
        return None
    
    attributes = {}
    pos = 20
    end = 20 + msg_len
    if end > len(data):
        return None
    
    while pos < end:
        if pos + 4 > end:
            break
        attr_type, attr_len = struct.unpack('!HH', data[pos:pos+4])
        pos += 4
        if pos + attr_len > end:
            break
        attr_val = data[pos:pos+attr_len]
        attributes[attr_type] = attr_val
        padding = (4 - (attr_len % 4)) % 4
        pos += attr_len + padding
        
    return {
        'type': msg_type,
        'length': msg_len,
        'transaction_id': transaction_id,
        'attributes': attributes
    }

def verify_message_integrity(raw_data, key):
    if len(raw_data) < 20:
        return False
    msg_type, msg_len, magic = struct.unpack('!HHI', raw_data[:8])
    pos = 20
    end = 20 + msg_len
    if end > len(raw_data):
        return False
    
    mi_pos = -1
    mi_hash = None
    while pos < end:
        if pos + 4 > end:
            break
        attr_type, attr_len = struct.unpack('!HH', raw_data[pos:pos+4])
        if attr_type == 0x0008:
            mi_pos = pos
            mi_hash = raw_data[pos+4 : pos+4+attr_len]
            break
        pos += 4
        padding = (4 - (attr_len % 4)) % 4
        pos += attr_len + padding
        
    if mi_pos == -1 or not mi_hash:
        return False
    
    new_len = mi_pos - 20 + 24
    header_bytes = struct.pack('!H', msg_type) + struct.pack('!H', new_len) + raw_data[4:20]
    hmac_data = header_bytes + raw_data[20:mi_pos]
    computed = hmac.new(key, hmac_data, hashlib.sha1).digest()
    return computed == mi_hash

def build_stun_response(msg_type, transaction_id, attributes, key=None):
    attr_bytes = b''
    for attr_type, attr_val in attributes.items():
        attr_len = len(attr_val)
        padding = (4 - (attr_len % 4)) % 4
        attr_bytes += struct.pack('!HH', attr_type, attr_len) + attr_val + (b'\x00' * padding)
        
    if key:
        msg_len = len(attr_bytes) + 24
        header = struct.pack('!HHII', msg_type, msg_len, 0x2112A442, 0)
        header = header[:8] + transaction_id
        hmac_data = header + attr_bytes
        mi_hash = hmac.new(key, hmac_data, hashlib.sha1).digest()
        attr_bytes += struct.pack('!HH', 0x0008, 20) + mi_hash
        
    msg_len = len(attr_bytes)
    header = struct.pack('!HHII', msg_type, msg_len, 0x2112A442, 0)
    header = header[:8] + transaction_id
    return header + attr_bytes


class LocalTurnServer:
    def __init__(self, host="0.0.0.0", port=3478, secret="", realm="local-party"):
        self.host = host
        self.port = port
        self.secret = secret
        self.realm = realm
        self.socket = None
        self.running = False
        self.thread = None
        self.upnp_mapped = False
        
        # Allocations mapping client public address (ip, port) -> allocation info
        self.allocations = {}
        self.allocations_lock = threading.Lock()

    def start(self, enable_upnp=True):
        self.running = True
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind((self.host, self.port))
        
        # Start main listener thread
        self.thread = threading.Thread(target=self._run_listener, daemon=True)
        self.thread.start()
        
        # Start clean thread
        self.clean_thread = threading.Thread(target=self._run_cleaner, daemon=True)
        self.clean_thread.start()
        
        if enable_upnp:
            local_ip = get_local_ip()
            logger.info(f"Attempting UPnP auto-forwarding for UDP port {self.port} on local IP {local_ip}")
            mapped_udp, msg_udp = add_upnp_port_mapping(self.port, self.port, local_ip, 'UDP')
            mapped_tcp, msg_tcp = add_upnp_port_mapping(self.port, self.port, local_ip, 'TCP')
            if mapped_udp or mapped_tcp:
                self.upnp_mapped = True
                logger.info(f"UPnP status: UDP={mapped_udp} ({msg_udp}), TCP={mapped_tcp} ({msg_tcp})")
            else:
                logger.warning(f"UPnP auto-forwarding failed: {msg_udp}")

    def stop(self):
        self.running = False
        if self.socket:
            self.socket.close()
        with self.allocations_lock:
            for addr, alloc in list(self.allocations.items()):
                alloc['relay_socket'].close()
            self.allocations.clear()
        logger.info("Local TURN server stopped.")

    def _run_cleaner(self):
        while self.running:
            time.sleep(10)
            now = time.time()
            with self.allocations_lock:
                for addr, alloc in list(self.allocations.items()):
                    if now > alloc['expire_time']:
                        logger.info(f"TURN allocation for client {addr} expired.")
                        alloc['relay_socket'].close()
                        del self.allocations[addr]

    def _run_listener(self):
        logger.info(f"Inbuilt TURN server listener running on {self.host}:{self.port}")
        while self.running:
            try:
                data, addr = self.socket.recvfrom(65535)
                if not data:
                    continue
                
                # Check if it's a Channel Data message
                if len(data) >= 4 and (0x4000 <= struct.unpack('!H', data[:2])[0] <= 0x7FFF):
                    self._handle_channel_data(data, addr)
                else:
                    self._handle_stun_message(data, addr)
            except Exception as e:
                if self.running:
                    logger.debug(f"Error in TURN listener: {e}")

    def _handle_channel_data(self, data, client_addr):
        channel_num, length = struct.unpack('!HH', data[:4])
        payload = data[4:4+length]
        
        with self.allocations_lock:
            alloc = self.allocations.get(client_addr)
            if not alloc:
                return
            peer_addr = alloc['channels'].get(channel_num)
            if not peer_addr:
                return
            
            # Send payload to peer
            try:
                alloc['relay_socket'].sendto(payload, peer_addr)
            except Exception as e:
                logger.debug(f"Failed to relay channel data from {client_addr} to {peer_addr}: {e}")

    def _handle_stun_message(self, data, client_addr):
        msg = parse_stun_message(data)
        if not msg:
            return
            
        msg_type = msg['type']
        tx_id = msg['transaction_id']
        attrs = msg['attributes']
        
        if msg_type == STUN_BINDING_REQUEST:
            resp_attrs = {
                ATTR_XOR_MAPPED_ADDRESS: encode_xor_address(client_addr[0], client_addr[1])
            }
            resp_data = build_stun_response(STUN_BINDING_RESPONSE, tx_id, resp_attrs)
            self.socket.sendto(resp_data, client_addr)
            
        elif msg_type == TURN_ALLOCATE_REQUEST:
            self._handle_allocate(data, msg, client_addr)
            
        elif msg_type == TURN_REFRESH_REQUEST:
            self._handle_refresh(msg, client_addr)
            
        elif msg_type == TURN_CREATE_PERMISSION_REQUEST:
            self._handle_create_permission(msg, client_addr)
            
        elif msg_type == TURN_CHANNEL_BIND_REQUEST:
            self._handle_channel_bind(msg, client_addr)
            
        elif msg_type == TURN_SEND_INDICATION:
            self._handle_send_indication(msg, client_addr)

    def _handle_allocate(self, raw_data, msg, client_addr):
        tx_id = msg['transaction_id']
        attrs = msg['attributes']
        
        username_bytes = attrs.get(ATTR_USERNAME)
        mi_bytes = attrs.get(ATTR_MESSAGE_INTEGRITY)
        
        if not username_bytes or not mi_bytes:
            # 401 Unauthorized
            nonce = f"{int(time.time())}".encode('utf-8')
            resp_attrs = {
                ATTR_REALM: self.realm.encode('utf-8'),
                ATTR_NONCE: nonce,
                ATTR_ERROR_CODE: struct.pack('!BB', 4, 1) + b"Unauthorized"
            }
            resp_data = build_stun_response(TURN_ALLOCATE_ERROR, tx_id, resp_attrs)
            self.socket.sendto(resp_data, client_addr)
            return

        username = username_bytes.decode('utf-8', errors='ignore')
        parts = username.split(':')
        if len(parts) < 2:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 400, "Bad Request")
            return
            
        try:
            timestamp = int(parts[0])
        except ValueError:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 400, "Bad Request")
            return
            
        if time.time() > timestamp:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 401, "Credentials Expired")
            return

        pw_dig = hmac.new(self.secret.encode('utf-8'), username.encode('utf-8'), hashlib.sha1).digest()
        expected_password = base64.b64encode(pw_dig).decode('utf-8')
        
        key_str = f"{username}:{self.realm}:{expected_password}"
        key = hashlib.md5(key_str.encode('utf-8')).digest()
        
        if not verify_message_integrity(raw_data, key):
            logger.warning(f"TURN authentication failed for client {client_addr}")
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 401, "Unauthorized")
            return

        with self.allocations_lock:
            if client_addr in self.allocations:
                alloc = self.allocations[client_addr]
                alloc['expire_time'] = time.time() + 600
                relay_port = alloc['relay_port']
            else:
                relay_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                relay_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                relay_sock.bind(('0.0.0.0', 0))
                relay_port = relay_sock.getsockname()[1]
                
                alloc = {
                    'relay_socket': relay_sock,
                    'relay_port': relay_port,
                    'expire_time': time.time() + 600,
                    'permissions': set(),
                    'channels': {}
                }
                self.allocations[client_addr] = alloc
                threading.Thread(target=self._run_relay_listener, args=(client_addr, relay_sock), daemon=True).start()
                logger.info(f"Created TURN allocation for client {client_addr} on relay port {relay_port}")

        public_ip = get_public_ip() or get_local_ip()
        
        resp_attrs = {
            ATTR_XOR_MAPPED_ADDRESS: encode_xor_address(client_addr[0], client_addr[1]),
            ATTR_XOR_RELAYED_ADDRESS: encode_xor_address(public_ip, relay_port),
            ATTR_LIFETIME: struct.pack('!I', 600)
        }
        resp_data = build_stun_response(TURN_ALLOCATE_RESPONSE, tx_id, resp_attrs, key)
        self.socket.sendto(resp_data, client_addr)

    def _run_relay_listener(self, client_addr, relay_socket):
        while self.running:
            try:
                data, peer_addr = relay_socket.recvfrom(65535)
                if not data:
                    continue
                
                with self.allocations_lock:
                    alloc = self.allocations.get(client_addr)
                    if not alloc or (peer_addr[0] not in alloc['permissions']):
                        continue
                    
                    bound_channel = None
                    for ch, addr in alloc['channels'].items():
                        if addr == peer_addr:
                            bound_channel = ch
                            break
                    
                    if bound_channel is not None:
                        header = struct.pack('!HH', bound_channel, len(data))
                        self.socket.sendto(header + data, client_addr)
                    else:
                        tx_id = struct.pack('!III', 0, 0, 0)
                        resp_attrs = {
                            ATTR_XOR_PEER_ADDRESS: encode_xor_address(peer_addr[0], peer_addr[1]),
                            ATTR_DATA: data
                        }
                        resp_data = build_stun_response(TURN_DATA_INDICATION, tx_id, resp_attrs)
                        self.socket.sendto(resp_data, client_addr)
            except Exception:
                break

    def _handle_refresh(self, msg, client_addr):
        tx_id = msg['transaction_id']
        attrs = msg['attributes']
        
        lifetime_bytes = attrs.get(ATTR_LIFETIME)
        lifetime = 600
        if lifetime_bytes:
            lifetime = struct.unpack('!I', lifetime_bytes)[0]
            
        with self.allocations_lock:
            alloc = self.allocations.get(client_addr)
            if not alloc:
                self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 437, "Allocation Mismatch")
                return
                
            if lifetime == 0:
                alloc['relay_socket'].close()
                del self.allocations[client_addr]
                logger.info(f"Deleted TURN allocation for client {client_addr} via Refresh lifetime=0")
                resp_attrs = {
                    ATTR_LIFETIME: struct.pack('!I', 0)
                }
            else:
                alloc['expire_time'] = time.time() + lifetime
                resp_attrs = {
                    ATTR_LIFETIME: struct.pack('!I', lifetime)
                }
                
        resp_data = build_stun_response(TURN_REFRESH_RESPONSE, tx_id, resp_attrs)
        self.socket.sendto(resp_data, client_addr)

    def _handle_create_permission(self, msg, client_addr):
        tx_id = msg['transaction_id']
        attrs = msg['attributes']
        
        peer_addr_bytes = attrs.get(ATTR_XOR_PEER_ADDRESS)
        if not peer_addr_bytes:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 400, "Bad Request")
            return
            
        peer_addr = decode_xor_address(peer_addr_bytes, tx_id)
        if not peer_addr:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 400, "Bad Request")
            return
            
        with self.allocations_lock:
            alloc = self.allocations.get(client_addr)
            if not alloc:
                self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 437, "Allocation Mismatch")
                return
            alloc['permissions'].add(peer_addr[0])
            
        resp_data = build_stun_response(TURN_CREATE_PERMISSION_RESPONSE, tx_id, {})
        self.socket.sendto(resp_data, client_addr)

    def _handle_channel_bind(self, msg, client_addr):
        tx_id = msg['transaction_id']
        attrs = msg['attributes']
        
        peer_addr_bytes = attrs.get(ATTR_XOR_PEER_ADDRESS)
        channel_bytes = attrs.get(0x000C)
        if not peer_addr_bytes or not channel_bytes:
            self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 400, "Bad Request")
            return
            
        peer_addr = decode_xor_address(peer_addr_bytes, tx_id)
        channel_num = struct.unpack('!H', channel_bytes[:2])[0]
        
        with self.allocations_lock:
            alloc = self.allocations.get(client_addr)
            if not alloc:
                self._send_error(TURN_ALLOCATE_ERROR, tx_id, client_addr, 437, "Allocation Mismatch")
                return
            alloc['channels'][channel_num] = peer_addr
            alloc['permissions'].add(peer_addr[0])
            logger.info(f"Bound channel {hex(channel_num)} -> {peer_addr} for client {client_addr}")
            
        resp_data = build_stun_response(TURN_CHANNEL_BIND_RESPONSE, tx_id, {})
        self.socket.sendto(resp_data, client_addr)

    def _handle_send_indication(self, msg, client_addr):
        attrs = msg['attributes']
        peer_addr_bytes = attrs.get(ATTR_XOR_PEER_ADDRESS)
        data = attrs.get(ATTR_DATA)
        if not peer_addr_bytes or not data:
            return
            
        peer_addr = decode_xor_address(peer_addr_bytes, msg['transaction_id'])
        if not peer_addr:
            return
            
        with self.allocations_lock:
            alloc = self.allocations.get(client_addr)
            if not alloc:
                return
            
            try:
                alloc['relay_socket'].sendto(data, peer_addr)
            except Exception as e:
                logger.debug(f"Failed to relay send indication from {client_addr} to {peer_addr}: {e}")

    def _send_error(self, err_type, tx_id, client_addr, code, phrase):
        resp_attrs = {
            ATTR_ERROR_CODE: struct.pack('!BB', code // 100, code % 100) + phrase.encode('utf-8')
        }
        resp_data = build_stun_response(err_type, tx_id, resp_attrs)
        self.socket.sendto(resp_data, client_addr)
