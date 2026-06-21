import os
import re
import time
import json
import difflib
import requests
import subprocess
from bs4 import BeautifulSoup
from utils.logger import logger
from utils.cache import EmbeddingCache

# Blocklist of common non-name terms in filenames and search results
NON_NAME_WORDS = {
    # File formats & Quality tags
    'scene', 'part', 'vol', 'volume', 'compilation', 'video', 'clip', 'hd', 'sd', '4k', 
    '1080p', '720p', '2160p', 'fullhd', 'unrated', 'director', 'cut', 'trailer', 'teaser',
    'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'best', 'top', 'classic', 'hot', 'sexy',
    'girl', 'girls', 'woman', 'women', 'female', 'male', 'man', 'men', 'couple', 'solo',
    'movie', 'film', 'shoot', 'photoshoot', 'model', 'famous', 'xxx', 'porn', 'adult',
    'studio', 'site', 'production', 'club', 'network', 'entertainment',
    
    # Newly added common words and site names
    'atk', 'galleria', 'atkgalleria', 'taboo', 'heat', 'tabooheat', 'evil', 'angel', 'evilangel', 
    'momxxx', 'public', 'agent', 'publicagent', 'hussie', 'pass', 'hussiepass', 'backdoor', 
    'chanel', 'backdoorchanel', 'brazzers', 'chaturbate', 'nakedbakerss', 'nakedbaker', 'nakedbakers', 
    'bang', 'yngr', 'bangyngr', 'filester', 'me', 'pixeldrain', 'gofile', 'cloud', 'storage', 
    'download', 'upload', 'link', 'free', 'premium', 'amateri', 'amateur', 'file', 'viewer', 
    'fileviewer', 'ready', 'assist', 'birthday', 'orgy', 'party', 'cns', 'atkg', 'sz', 'got', 
    'dap', 'ed', 'dp', 'by', 'cocks', 'the', 'and', 'with', 'for', 'from', 'gets', 'her', 
    'first', 'real', 'fuck', 'tries', 'big', 'black', 'dick', 'dicks', 'anal', 'sex', 
    'interracial', 'penetration', 'tight', 'holes', 'stretched', 'new', 'zealand', 'all', 
    'maps', 'yandex', 'google', 'search', 'image', 'images', 'appears', 'contain', 'to', 
    'original', 'size', 'kb', 'mb', 'gb', 'resolution', 'photo', 'photos', 'wallpapers', 
    'wallpaper', 'pics', 'pic', 'actress', 'model', 'star', 'pornstar', 'channel', 'playlist',
    'youtube', 'tiktok', 'instagram', 'twitter', 'facebook', 'social', 'media', 'profile',
    'pin', 'di', 'mail', 'ru', 'let', 'sporn', 'porrfilm', 'spankbang', 'eyeshadow', 'fuji', 
    'mug', 'it', 'two', 'sock', 'stark', 'frida', 'metart', 'bible',
    
    # Common English prepositions, pronouns and small junk words
    'in', 'on', 'at', 'of', 'to', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 
    'have', 'has', 'had', 'do', 'does', 'did', 'a', 'an', 'this', 'that', 'these', 'those', 
    'my', 'your', 'his', 'its', 'our', 'their', 'me', 'you', 'him', 'us', 'them', 'who', 
    'whom', 'which', 'what', 'whose', 'why', 'how', 'if', 'or', 'but', 'as', 'until', 
    'while', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 
    'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 
    'then', 'once', 'st', 'nd', 'rd', 'th', 's'
}

class FilenameParser:
    """
    Extracts potential name candidates from video and photo filenames.
    """
    @staticmethod
    def clean_token(token: str) -> str:
        # Keep only alphabetic characters
        return re.sub(r'[^a-zA-Z]', '', token)

    @classmethod
    def parse_filename(cls, filename: str) -> str:
        # Remove extension
        name_part, _ = os.path.splitext(filename)
        
        # Replace common delimiters with space
        name_part = re.sub(r'[_.\-\s+]+', ' ', name_part)
        
        # Handle CamelCase (e.g. HazelMoore -> Hazel Moore)
        name_part = re.sub(r'(?<!^)(?=[A-Z][a-z])', ' ', name_part)
        
        # Split into tokens
        tokens = name_part.split()
        cleaned_tokens = []
        for t in tokens:
            cleaned = cls.clean_token(t)
            # Filter out single letter/character tokens and words on the blocklist
            if cleaned and len(cleaned) > 1 and cleaned.lower() not in NON_NAME_WORDS:
                cleaned_tokens.append(cleaned)
                
        # Look for 2 or 3 capitalized tokens
        # Title case them to normalize
        cleaned_tokens = [t.capitalize() for t in cleaned_tokens]
        
        if 2 <= len(cleaned_tokens) <= 3:
            # Reconstruct name
            candidate = " ".join(cleaned_tokens)
            return candidate
            
        # If we have more tokens, check if the first 2 or 3 can make a name
        if len(cleaned_tokens) > 3:
            candidate = " ".join(cleaned_tokens[:2])
            return candidate
            
        return None

    @classmethod
    def extract_name_from_folder(cls, folder_path: str) -> tuple:
        """
        Scans all files inside a folder and extracts the most frequent name candidate.
        Returns (name, confidence) or (None, 0.0)
        """
        if not os.path.exists(folder_path):
            return None, 0.0
            
        candidates = []
        for file in os.listdir(folder_path):
            file_path = os.path.join(folder_path, file)
            if os.path.isfile(file_path):
                # Ignore reference images, database JSONs, etc.
                if file.startswith('_'):
                    continue
                name = cls.parse_filename(file)
                if name:
                    candidates.append(name)
                    
        if not candidates:
            return None, 0.0
            
        # Count frequencies
        freq = {}
        for c in candidates:
            freq[c] = freq.get(c, 0) + 1
            
        best_candidate = max(freq, key=freq.get)
        match_count = freq[best_candidate]
        total_files = len(candidates)
        
        # Confidence based on consistency and volume of evidence
        ratio = match_count / total_files if total_files > 0 else 0
        if match_count == 1:
            confidence = 0.45
        elif match_count == 2:
            confidence = 0.65 if ratio >= 0.7 else 0.55
        elif match_count >= 5:
            confidence = 0.85 if ratio >= 0.8 else 0.75
        else:  # match_count is 3 or 4
            confidence = 0.75 if ratio >= 0.7 else 0.65
            
        return best_candidate, confidence


class ReverseImageSearcher:
    """
    Identifies faces visually by performing reverse image search.
    """
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    def search_yandex(self, image_path: str) -> list:
        """
        Sends the image to Yandex reverse search and extracts matching text.
        """
        logger.info(f"Querying Yandex reverse image search for {os.path.basename(image_path)}")
        search_url = 'https://yandex.com/images/search'
        params = {
            'rpt': 'imageview',
            'format': 'json',
            'request': '{"blocks":[{"block":"b-page_type_search-by-image__link"}]}'
        }
        
        try:
            with open(image_path, 'rb') as f:
                files = {'upfile': ('blob', f, 'image/jpeg')}
                response = self.session.post(search_url, params=params, files=files, timeout=15)
                
            if response.status_code != 200:
                logger.warning(f"Yandex POST upload returned status {response.status_code}")
                return []
                
            data = response.json()
            cbir_id = data['blocks'][0]['params']['cbirId']
            
            # Fetch results page
            results_url = f"https://yandex.com/images/search?cbir_id={cbir_id}&rpt=imageview"
            res = self.session.get(results_url, timeout=15)
            
            if res.status_code != 200:
                logger.warning(f"Yandex GET results returned status {res.status_code}")
                return []
                
            return self.parse_yandex_html(res.text)
            
        except Exception as e:
            logger.error(f"Yandex search exception: {e}")
            return []

    def parse_yandex_html(self, html: str) -> list:
        soup = BeautifulSoup(html, 'html.parser')
        candidates = []
        
        # 1. Look in CbirTags (tags/guess text)
        tag_section = soup.find(class_=lambda x: x and 'CbirTags' in x)
        if tag_section:
            for item in tag_section.find_all(class_=lambda x: x and ('button' in x.lower() or 'link' in x.lower() or 'tag' in x.lower())):
                if not item.find():  # Only take leaf elements to avoid matching parent container wrappers
                    txt = item.get_text().strip()
                    if txt:
                        candidates.append(txt)
            # Always append the full text separated by spaces to ensure tags are not joined together
            txt_full = tag_section.get_text(separator=' ').strip()
            if txt_full:
                candidates.append(txt_full.replace("Image appears to contain", "").strip())
                
        # 2. Look in CbirSites-ItemTitle (similar page titles)
        for title_el in soup.find_all(class_=lambda x: x and 'CbirSites-ItemTitle' in x):
            txt = title_el.get_text().strip()
            if txt:
                candidates.append(txt)
                
        return candidates

    def search_google_lens(self, image_path: str) -> list:
        """
        Fallback search using Google Lens via subprocess curl to bypass TLS checks.
        """
        logger.info(f"Querying Google Lens reverse image search for {os.path.basename(image_path)}")
        try:
            # 1. POST curl upload
            cmd_post = [
                "curl", "-s", "-i",
                "-F", f"encoded_image=@{image_path}",
                "https://lens.google.com/upload?hl=en"
            ]
            result_post = subprocess.run(cmd_post, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=20)
            
            location_match = re.search(r"Location:\s*(https://[^\r\n]+)", result_post.stdout, re.IGNORECASE)
            if not location_match:
                logger.warning("Google Lens Location header not found")
                return []
                
            redirect_url = location_match.group(1).strip()
            
            # 2. GET curl fetch results page
            cmd_get = [
                "curl", "-s", "-L",
                "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "-H", "Accept-Language: en-US,en;q=0.8",
                redirect_url
            ]
            result_get = subprocess.run(cmd_get, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=20)
            html = result_get.stdout
            
            if "Forbidden" in html or "403. That" in html:
                logger.warning("Google Lens GET results returned 403 Forbidden")
                return []
                
            return self.parse_google_html(html)
            
        except Exception as e:
            logger.error(f"Google Lens search exception: {e}")
            return []

    def parse_google_html(self, html: str) -> list:
        soup = BeautifulSoup(html, 'html.parser')
        candidates = []
        
        # Extract all link text, anchor title text and visible spans
        for a in soup.find_all('a'):
            href = a.get('href', '')
            text = a.get_text().strip()
            title = a.get('title', '')
            if href.startswith('http') and not 'google.com' in href:
                if text:
                    candidates.append(text)
                elif title:
                    candidates.append(title)
                    
        for span in soup.find_all('span'):
            txt = span.get_text().strip()
            if txt and len(txt) > 5:
                candidates.append(txt)
                
        return candidates

    def find_name_in_candidates(self, candidates: list) -> tuple:
        """
        Parses all candidate strings from search results to find the most frequent name.
        """
        if not candidates:
            return None, 0.0
            
        name_counts = {}
        for c in candidates:
            # Replace non-Latin characters with spaces to handle mixed Cyrillic/English text
            cleaned = re.sub(r'[^a-zA-Z\s]', ' ', c)
            cleaned = " ".join(cleaned.split())
            
            # Extract sequences of 2 or 3 Latin words (length >= 2 each) case-insensitively, allowing only 1-2 spaces between words
            matches = re.findall(r'\b[a-zA-Z]{2,}\b\s{1,2}\b[a-zA-Z]{2,}\b(?:\s{1,2}\b[a-zA-Z]{2,}\b)?', cleaned)
            for name in matches:
                # Normalize: title case each word in the name candidate
                words = [w.capitalize() for w in name.split()]
                
                # Filter out candidates containing any blocklisted words
                if any(w.lower() in NON_NAME_WORDS for w in words):
                    continue
                    
                norm_name = " ".join(words)
                name_counts[norm_name] = name_counts.get(norm_name, 0) + 1
                
        if not name_counts:
            return None, 0.0
            
        best_name = max(name_counts, key=name_counts.get)
        count = name_counts[best_name]
        
        # Confidence logic based on match count
        confidence = 0.5
        if count >= 3:
            confidence = 0.7
        if count >= 6:
            confidence = 0.8
            
        return best_name, confidence


class NameResolver:
    """
    Main class that orchestrates filename parsing and reverse search to rename folders.
    """
    def __init__(self, config):
        self.config = config
        self.searcher = ReverseImageSearcher()

    def resolve_folder_name(self, folder_path: str) -> tuple:
        """
        Identifies the name for a folder.
        Returns (name, confidence, source)
        """
        # 1. Parse filenames inside folder
        file_name, file_conf = FilenameParser.extract_name_from_folder(folder_path)
        
        # 2. Run reverse image search if ref face exists
        ref_face = os.path.join(folder_path, "_reference_face.jpg")
        search_name = None
        search_conf = 0.0
        search_source = "None"
        
        if os.path.exists(ref_face):
            # Try Yandex first (native python, highly reliable)
            yandex_candidates = self.searcher.search_yandex(ref_face)
            search_name, search_conf = self.searcher.find_name_in_candidates(yandex_candidates)
            if search_name:
                search_source = "Yandex"
            else:
                # If Yandex fails, try Google Lens (via curl)
                # Respect delay
                time.sleep(1.0)
                lens_candidates = self.searcher.search_google_lens(ref_face)
                search_name, search_conf = self.searcher.find_name_in_candidates(lens_candidates)
                if search_name:
                    search_source = "Google Lens"
                    
        # 3. Cross-reference results
        if file_name and search_name:
            # Check if they match (fuzzy ratio)
            ratio = difflib.SequenceMatcher(None, file_name.lower(), search_name.lower()).ratio()
            if ratio >= 0.8:
                # Highest confidence when both agree
                return search_name, 0.95, f"Cross-Referenced ({search_source} & Filename)"
            else:
                # Disagreement: prefer search name only if it has high confidence, otherwise prefer filename
                if search_conf >= 0.7 and search_conf > file_conf:
                    return search_name, search_conf - 0.1, f"{search_source} (Filename disagreed: {file_name})"
                else:
                    return file_name, file_conf - 0.1, f"Filename (Search disagreed: {search_name})"
                    
        if search_name:
            return search_name, search_conf, search_source
            
        if file_name:
            return file_name, file_conf, "Filename"
            
        return None, 0.0, "None"

    def resolve_all_folders(self, output_dir: str, progress_cb=None) -> dict:
        """
        Scans all folders in the output directory, resolves names, and renames folders.
        Handles conflicts (merging vs keeping separate).
        """
        if not os.path.exists(output_dir):
            return {}
            
        resolved_actions = {}
        folders = [f for f in os.listdir(output_dir) if os.path.isdir(os.path.join(output_dir, f))]
        
        # Keep track of renamed target directories to resolve conflicts
        # Map target_dir_path -> list of source_dir_paths
        conflict_map = {}
        
        folders = [f for f in folders if not (f.startswith('_') or f.startswith('.'))]
        total = len(folders)
        for idx, folder in enumerate(folders):
            folder_path = os.path.join(output_dir, folder)
            
            if progress_cb:
                progress_cb(idx + 1, total, f"Identifying profile: {folder}...")
                
            name, conf, source = self.resolve_folder_name(folder_path)
            
            if name and conf >= self.config.name_confidence_threshold:
                # Sanitize name for folder creation (alphanumeric and spaces)
                clean_name = re.sub(r'[^a-zA-Z0-9\s]', '', name).strip()
                if clean_name:
                    dest_path = os.path.join(output_dir, clean_name)
                    if dest_path not in conflict_map:
                        conflict_map[dest_path] = []
                    conflict_map[dest_path].append((folder_path, conf, name, source))
                    
            # Be polite, add search delay
            if os.path.exists(os.path.join(folder_path, "_reference_face.jpg")):
                time.sleep(self.config.name_search_delay)
                
        # Now apply renaming and resolve conflicts
        for dest_path, sources in conflict_map.items():
            clean_name = os.path.basename(dest_path)
            
            if len(sources) == 1:
                # No conflict! Rename directly.
                src_path, conf, name, source = sources[0]
                if src_path == dest_path:
                    # Already named correctly
                    resolved_actions[os.path.basename(src_path)] = {
                        'status': 'no_change',
                        'name': name,
                        'confidence': conf,
                        'source': source
                    }
                    continue
                    
                try:
                    self._rename_and_update(src_path, dest_path)
                    resolved_actions[os.path.basename(src_path)] = {
                        'status': 'renamed',
                        'new_name': clean_name,
                        'name': name,
                        'confidence': conf,
                        'source': source
                    }
                except Exception as e:
                    logger.error(f"Rename failed from {src_path} to {dest_path}: {e}")
                    
            else:
                # Conflict! Multiple clusters resolve to the same name
                logger.info(f"Conflict detected: multiple folders resolved to '{clean_name}': {[os.path.basename(s[0]) for s in sources]}")
                
                if self.config.merge_on_name_conflict:
                    # MERGE folders
                    # Move everything from other folders to the first one, then delete them
                    first_src_path, first_conf, first_name, first_source = sources[0]
                    
                    # Ensure first folder is renamed to dest_path
                    if first_src_path != dest_path:
                        try:
                            self._rename_and_update(first_src_path, dest_path)
                        except Exception as e:
                            logger.error(f"Failed to rename base folder for merge: {e}")
                            continue
                            
                    resolved_actions[os.path.basename(first_src_path)] = {
                        'status': 'merged_base',
                        'new_name': clean_name,
                        'name': first_name,
                        'confidence': first_conf,
                        'source': first_source
                    }
                    
                    # Now merge the others
                    for src_path, conf, name, source in sources[1:]:
                        try:
                            self._merge_folders(src_path, dest_path)
                            resolved_actions[os.path.basename(src_path)] = {
                                'status': 'merged_into',
                                'merged_to': clean_name,
                                'name': name,
                                'confidence': conf,
                                'source': source
                            }
                        except Exception as e:
                            logger.error(f"Failed to merge {src_path} into {dest_path}: {e}")
                            
                else:
                    # DO NOT MERGE: Keep them separate by adding suffixes (e.g. Hazel Moore, Hazel Moore 2)
                    for idx, (src_path, conf, name, source) in enumerate(sources):
                        suffix = f" {idx+1}" if idx > 0 else ""
                        suffixed_name = clean_name + suffix
                        suffixed_dest_path = os.path.join(output_dir, suffixed_name)
                        
                        if src_path == suffixed_dest_path:
                            resolved_actions[os.path.basename(src_path)] = {
                                'status': 'no_change',
                                'name': name,
                                'confidence': conf,
                                'source': source
                            }
                            continue
                            
                        try:
                            self._rename_and_update(src_path, suffixed_dest_path)
                            resolved_actions[os.path.basename(src_path)] = {
                                'status': 'renamed_suffixed',
                                'new_name': suffixed_name,
                                'name': name,
                                'confidence': conf,
                                'source': source
                            }
                        except Exception as e:
                            logger.error(f"Renaming with suffix failed for {src_path}: {e}")
                            
        return resolved_actions

    def _rename_and_update(self, src_path: str, dest_path: str):
        """
        Renames the folder, updates its internal JSON embedding file, and updates SQLite DB.
        """
        old_folder_name = os.path.basename(src_path)
        new_folder_name = os.path.basename(dest_path)
        
        # 1. Rename folder on disk
        import shutil
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        shutil.move(src_path, dest_path)
        logger.info(f"Disk folder renamed: {old_folder_name} -> {new_folder_name}")
        
        # 2. Update _profile_embedding.json inside folder
        json_path = os.path.join(dest_path, "_profile_embedding.json")
        profile_id = None
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r') as f:
                    data = json.load(f)
                data['folder_name'] = new_folder_name
                profile_id = data.get('profile_id')
                with open(json_path, 'w') as f:
                    json.dump(data, f, indent=4)
                logger.info(f"Updated metadata JSON for profile {profile_id}")
            except Exception as e:
                logger.error(f"Failed to update metadata JSON folder name: {e}")
                
        # 3. Update SQLite Database cache registry
        if profile_id is not None:
            cache_dir = os.path.join(os.path.dirname(os.path.dirname(src_path)), ".cache")
            cache = EmbeddingCache(cache_dir)
            cache.update_profile_folder_name(int(profile_id), new_folder_name)
            logger.info(f"Updated profile registry database for ID {profile_id} -> {new_folder_name}")

    def _merge_folders(self, src_path: str, dest_path: str):
        """
        Moves all video/photo files from src_path to dest_path, then deletes src_path.
        Doesn't move reference crops or metadata JSONs.
        """
        old_folder_name = os.path.basename(src_path)
        new_folder_name = os.path.basename(dest_path)
        
        # Move files
        for item in os.listdir(src_path):
            src_item = os.path.join(src_path, item)
            dest_item = os.path.join(dest_path, item)
            
            # Skip profile metadata files
            if item.startswith('_'):
                continue
                
            if os.path.isfile(src_item):
                # Handle filename collision
                if os.path.exists(dest_item):
                    base, ext = os.path.splitext(item)
                    counter = 1
                    while os.path.exists(os.path.join(dest_path, f"{base}_{counter}{ext}")):
                        counter += 1
                    dest_item = os.path.join(dest_path, f"{base}_{counter}{ext}")
                import shutil
                shutil.move(src_item, dest_item)
                
        # Delete source folder
        import shutil
        shutil.rmtree(src_path)
        logger.info(f"Merged folder {old_folder_name} into {new_folder_name} and deleted source folder.")


def merge_folders_manual(output_dir: str, folder_names: list, target_name: str = None) -> dict:
    """
    Manually merge multiple sorted folders into one.
    Averages face embeddings from all merged folders to create a more representative profile.
    
    Args:
        output_dir: The base output directory containing all sorted folders.
        folder_names: List of folder names to merge (e.g. ['female_003', 'female_010']).
        target_name: Optional name for the merged folder. If not provided, uses the first folder.
    
    Returns:
        dict with merge results.
    """
    import shutil
    import numpy as np
    
    if len(folder_names) < 2:
        return {'status': 'error', 'message': 'Need at least 2 folders to merge.'}
    
    # Validate all folders exist
    valid_folders = []
    for name in folder_names:
        path = os.path.join(output_dir, name)
        if os.path.isdir(path):
            valid_folders.append(name)
        else:
            logger.warning(f"Merge: folder '{name}' not found in output directory, skipping.")
    
    if len(valid_folders) < 2:
        return {'status': 'error', 'message': 'Less than 2 valid folders found after validation.'}
    
    # Determine target folder
    if target_name:
        dest_name = target_name
    else:
        dest_name = valid_folders[0]
    
    dest_path = os.path.join(output_dir, dest_name)
    
    # Resolve cache directory
    cache_dir = os.path.join(os.path.dirname(output_dir), '.cache')
    if not os.path.isdir(cache_dir):
        cache_dir = os.path.abspath(os.path.join(output_dir, '..', '.cache'))
    
    # Step 1: Collect all embeddings from all folders being merged
    all_embeddings = []
    all_profile_ids = []
    target_profile_id = None
    
    for folder_name in valid_folders:
        folder_path = os.path.join(output_dir, folder_name)
        profile_json_path = os.path.join(folder_path, '_profile_embedding.json')
        if os.path.exists(profile_json_path):
            try:
                with open(profile_json_path, 'r') as f:
                    data = json.load(f)
                embedding = data.get('embedding')
                profile_id = data.get('profile_id')
                if embedding:
                    all_embeddings.append(np.array(embedding, dtype=np.float32))
                if profile_id is not None:
                    all_profile_ids.append(int(profile_id))
            except Exception as e:
                logger.warning(f"Failed to read embedding from {folder_name}: {e}")
    
    # Step 2: Compute the averaged (merged) embedding
    merged_embedding = None
    if all_embeddings:
        merged_embedding = np.mean(all_embeddings, axis=0)
        # Normalize the averaged embedding (L2 normalize for cosine similarity)
        norm = np.linalg.norm(merged_embedding)
        if norm > 0:
            merged_embedding = merged_embedding / norm
        logger.info(f"Averaged {len(all_embeddings)} embeddings for merged profile")
    
    # Step 3: If target_name is new and doesn't exist, rename the first source folder to it
    first_src = os.path.join(output_dir, valid_folders[0])
    if target_name and not os.path.exists(dest_path):
        shutil.move(first_src, dest_path)
        logger.info(f"Renamed {valid_folders[0]} -> {dest_name}")
        sources_to_merge = valid_folders[1:]
    elif target_name and os.path.exists(dest_path) and dest_name not in valid_folders:
        sources_to_merge = valid_folders
    else:
        sources_to_merge = [f for f in valid_folders if f != dest_name]
    
    merged_count = 0
    moved_files = []
    deleted_folders = []
    
    # Step 4: Move files and clean up source folders
    for src_name in sources_to_merge:
        src_path = os.path.join(output_dir, src_name)
        if not os.path.exists(src_path):
            continue
        
        # Move all non-metadata files
        for item in os.listdir(src_path):
            src_item = os.path.join(src_path, item)
            
            if item.startswith('_'):
                continue
            
            if os.path.isfile(src_item):
                dest_item = os.path.join(dest_path, item)
                if os.path.exists(dest_item):
                    base, ext = os.path.splitext(item)
                    counter = 1
                    while os.path.exists(os.path.join(dest_path, f"{base}_{counter}{ext}")):
                        counter += 1
                    dest_item = os.path.join(dest_path, f"{base}_{counter}{ext}")
                shutil.move(src_item, dest_item)
                moved_files.append(os.path.basename(dest_item))
                merged_count += 1
        
        # Delete the source profile from SQLite DB
        profile_json = os.path.join(src_path, '_profile_embedding.json')
        if os.path.exists(profile_json):
            try:
                with open(profile_json, 'r') as f:
                    data = json.load(f)
                profile_id = data.get('profile_id')
                if profile_id is not None:
                    cache = EmbeddingCache(cache_dir)
                    cache.delete_persistent_profile(int(profile_id))
                    logger.info(f"Deleted persistent profile ID {profile_id} for merged folder {src_name}")
            except Exception as e:
                logger.error(f"Failed to clean up profile for {src_name}: {e}")
        
        # Remove source folder
        shutil.rmtree(src_path)
        deleted_folders.append(src_name)
        logger.info(f"Merged {src_name} into {dest_name} ({merged_count} files moved so far)")
    
    # Step 5: Update the target folder's profile JSON and SQLite DB with merged embedding
    target_profile_json = os.path.join(dest_path, '_profile_embedding.json')
    if os.path.exists(target_profile_json):
        try:
            with open(target_profile_json, 'r') as f:
                data = json.load(f)
            
            # Update folder name
            data['folder_name'] = dest_name
            target_profile_id = data.get('profile_id')
            
            # Update embedding with the averaged one
            if merged_embedding is not None:
                data['embedding'] = merged_embedding.tolist()
                logger.info(f"Updated target profile embedding with average of {len(all_embeddings)} sources")
            
            with open(target_profile_json, 'w') as f:
                json.dump(data, f, indent=4)
            
            # Update SQLite: folder name + merged embedding
            if target_profile_id is not None:
                cache = EmbeddingCache(cache_dir)
                if merged_embedding is not None:
                    cache.add_persistent_profile_with_id(int(target_profile_id), dest_name, merged_embedding)
                    logger.info(f"Updated SQLite profile ID {target_profile_id} with merged embedding and name '{dest_name}'")
                else:
                    cache.update_profile_folder_name(int(target_profile_id), dest_name)
        except Exception as e:
            logger.error(f"Failed to update target profile JSON/DB: {e}")
    
    return {
        'status': 'success',
        'target_folder': dest_name,
        'merged_folders': deleted_folders,
        'files_moved': merged_count,
        'moved_files': moved_files,
        'embeddings_merged': len(all_embeddings)
    }

