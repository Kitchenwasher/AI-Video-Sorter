/**
 * Watch Party Cleanup and Teardown Module
 * Handles cleanly ending or leaving a party room session for both hosts and viewers.
 */

(function () {
    // Perform clean local teardown of all media tracks and connections, then redirect
    function leaveRoomCleanly() {
        console.log("[Teardown] Starting clean room departure...");
        
        // 1. Stop local webcam stream
        if (typeof window.stopLocalWebcam === 'function') {
            try {
                window.stopLocalWebcam({ emit: true });
            } catch (e) {
                console.error("Error stopping local webcam:", e);
            }
        }

        // 2. Stop local screen share stream
        if (typeof window.stopLocalScreenShare === 'function') {
            try {
                window.stopLocalScreenShare();
            } catch (e) {
                console.error("Error stopping local screen share:", e);
            }
        }

        // 3. Stop local mic voice stream
        if (typeof window.stopLocalVoice === 'function') {
            try {
                window.stopLocalVoice();
            } catch (e) {
                console.error("Error stopping local voice:", e);
            }
        }

        // 4. Close WebRTC peer connections
        if (typeof window.closeAllPeerConnections === 'function') {
            try {
                window.closeAllPeerConnections();
            } catch (e) {
                console.error("Error closing peer connections:", e);
            }
        }

        // 5. Disconnect Socket.IO client
        if (window.socket) {
            try {
                window.socket.disconnect();
            } catch (e) {
                console.error("Error disconnecting socket:", e);
            }
        }

        // 6. Redirect back to landing/dashboard
        console.log("[Teardown] Redirection initiated to dashboard.");
        window.location.href = '/';
    }

    // Main entry point bound to Leave button click
    window.handleLeaveOrEndCall = function () {
        const isAdmin = typeof window.getAdminToken === 'function' && !!window.getAdminToken();
        const partyId = window.PARTY_ID;

        if (isAdmin) {
            // First choice: End the party room completely
            window.showBrutalConfirm(
                'Are you sure you want to end this watch party session now? All connected participants will be disconnected.', 
                'End Party for Everyone'
            ).then(endConfirmed => {
                if (endConfirmed) {
                    console.log("[Teardown] Host chose to terminate room.");
                    const adminToken = window.getAdminToken();
                    fetch(`/api/watch-party/${partyId}/end`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ admin_token: adminToken })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            leaveRoomCleanly();
                        } else {
                            if (typeof window.showToast === 'function') {
                                window.showToast(data.message || 'Failed to end party.', 'error');
                            }
                        }
                    })
                    .catch(err => {
                        console.error("Error ending watch party:", err);
                        leaveRoomCleanly();
                    });
                } else {
                    // Second choice: Just leave personally
                    window.showBrutalConfirm(
                        'Do you want to leave the watch party room personally? The room will remain active for other participants.',
                        'Leave Party Room'
                    ).then(leaveConfirmed => {
                        if (leaveConfirmed) {
                            leaveRoomCleanly();
                        }
                    });
                }
            });
        } else {
            // Viewer simple leave confirmation
            window.showBrutalConfirm(
                'Are you sure you want to leave this watch party room?', 
                'Leave Party'
            ).then(confirmed => {
                if (confirmed) {
                    leaveRoomCleanly();
                }
            });
        }
    };
})();
