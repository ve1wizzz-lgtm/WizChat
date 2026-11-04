const firebaseConfig = {
  apiKey: "AIzaSyD99mv9x7tSAItOJ4UooTyPhNlewRGQnh0",
  authDomain: "wizchat-3e52f.firebaseapp.com",
  projectId: "wizchat-3e52f",
  storageBucket: "wizchat-3e52f.firebasestorage.app",
  messagingSenderId: "125275309502",
  appId: "1:125275309502:web:b30f41e2686976a46765ef",
  databaseURL: "https://wizchat-3e52f-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();
const auth = firebase.auth();

let currentRoomId = 'global'; 
let currentRoomRef = null; 
let currentTypingRef = null; 
let currentStatusRef = null; 
let currentBlockRef1 = null;
let currentBlockRef2 = null;
let currentProfileChannelId = null; 
let currentProfileUid = null; 
let activeReplyContext = null;
let messagesCache = {}; 
let typingTimeout;
let tempAvatarBase64 = null;
let currentMenuMsgId = null;
let menuCloseTimeout = null;
let allUsersCache = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingTimeout;function setupOnlineStatus(uid) {
    const isOffline = { state: 'offline', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const isOnline = { state: 'online', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const userRef = database.ref('/status/' + uid);
    database.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() == false) return;
        userRef.onDisconnect().set(isOffline).then(() => { userRef.set(isOnline); });
    });
}

function showModal(id) { const el = document.getElementById(id); if(el) el.classList.add('show'); }
function hideModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('show'); }

function openLightbox(src) {
    const lb = document.getElementById('imageLightbox');
    document.getElementById('lightboxImg').src = src;
    lb.style.display = 'flex';
    setTimeout(() => lb.classList.add('show'), 10);
}
function closeLightbox() {
    const lb = document.getElementById('imageLightbox');
    lb.classList.remove('show');
    setTimeout(() => lb.style.display = 'none', 300);
}function toggleChatSearch() {
    const container = document.getElementById('chatSearchContainer');
    container.classList.toggle('open');
    if (container.classList.contains('open')) {
        document.getElementById('chatSearchInput').focus();
    } else {
        document.getElementById('chatSearchInput').value = '';
        filterChatMessages('');
    }
}

function filterChatMessages(query) {
    const wrappers = document.querySelectorAll('.message-wrapper');
    const lowerQuery = query.toLowerCase();
    wrappers.forEach(w => {
        if (!query) { w.style.display = 'flex'; }
        else {
            const text = w.querySelector('.message').innerText.toLowerCase();
            w.style.display = text.includes(lowerQuery) ? 'flex' : 'none';
        }
    });
}

function toggleMuteChat() {
    const myId = localStorage.getItem('myUserId');
    if (!currentRoomId) return;
    const chatRef = database.ref(`userChats/${myId}/${currentRoomId}/muted`);
    chatRef.once('value').then(snap => {
        const isMuted = !snap.val();
        chatRef.set(isMuted);
        document.getElementById('muteToggle').checked = isMuted;
    });
}document.addEventListener("DOMContentLoaded", () => {
    const uploadInput = document.getElementById('avatarUpload');
    if(uploadInput) {
        uploadInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = 150; canvas.height = 150;
                    const minSize = Math.min(img.width, img.height);
                    const sx = (img.width - minSize) / 2;
                    const sy = (img.height - minSize) / 2;
                    ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, 150, 150);
                    tempAvatarBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    const profAvatar = document.getElementById('profileAvatar');
                    profAvatar.textContent = '';
                    profAvatar.style.backgroundImage = `url(${tempAvatarBase64})`;
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
});

function toggleRecording() {
    const micBtn = document.getElementById('micBtn');
    if (!isRecording) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        sendChatVoice(reader.result);
                        stream.getTracks().forEach(track => track.stop());
                    };
                    reader.readAsDataURL(audioBlob);
                };
                mediaRecorder.start();
                isRecording = true;
                micBtn.classList.add('recording');
                recordingTimeout = setTimeout(() => { if (isRecording) toggleRecording(); }, 30000);
            })
            .catch(err => { alert("Нет доступа к микрофону!"); console.error(err); });
    } else {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
        clearTimeout(recordingTimeout);
    }
}function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const btn = event.target.nextElementSibling;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳"; btn.disabled = true;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let width = img.width; let height = img.height;
            if (width > 600) { height = Math.round(height * (600 / width)); width = 600; }
            canvas.width = width; canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            btn.innerHTML = originalText; btn.disabled = false;
            event.target.value = '';
            sendChatImage(base64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function sendChatImage(base64Image) {
    const myId = localStorage.getItem('myUserId');
    if (!myId) return;
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val(); 
        const myName = myData ? myData.displayName || myData.username : "Аноним";
        const msgData = { text: "📷 Фотография", image: base64Image, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false };
        if (activeReplyContext) msgData.replyTo = activeReplyContext;
        if (currentRoomId !== 'global' && !currentRoomId.startsWith('ch_') && !currentRoomId.startsWith('gr_')) {
            const otherUid = currentRoomId.split('_').find(id => id !== myId);
            database.ref(`users/${otherUid}/blocked/${myId}`).once('value').then(bSnap => {
                if (bSnap.exists()) { alert("Пользователь заблокировал вас."); return; }
                pushImageMessage();
            });
        } else { pushImageMessage(); }
        function pushImageMessage() {
            database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                cancelReply();
                if (currentRoomId !== 'global') {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: "📷 Фотография" });
                }
            });
        }
    });
}function sendChatVoice(base64Audio) {
    const myId = localStorage.getItem('myUserId');
    if (!myId) return;
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val(); 
        const myName = myData ? myData.displayName || myData.username : "Аноним";
        const msgData = { text: "🎤 Голосовое", audio: base64Audio, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false };
        if (activeReplyContext) msgData.replyTo = activeReplyContext;
        if (currentRoomId !== 'global' && !currentRoomId.startsWith('ch_') && !currentRoomId.startsWith('gr_')) {
            const otherUid = currentRoomId.split('_').find(id => id !== myId);
            database.ref(`users/${otherUid}/blocked/${myId}`).once('value').then(bSnap => {
                if (bSnap.exists()) { alert("Пользователь заблокировал вас."); return; }
                pushVoiceMessage();
            });
        } else { pushVoiceMessage(); }
        function pushVoiceMessage() {
            database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                cancelReply();
                if (currentRoomId !== 'global') {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: "🎤 Голосовое" });
                }
            });
        }
    });
}

const quickEmojis = ['😀','😂','😍','🥰','😎','😭','🤔','👍','🔥','❤️','🎉','🙏','🤡','💩','👻','💀','🤖','💯','👀','👌'];function toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    if (panel.style.display === 'none') {
        if(panel.innerHTML === '') {
            let html = '';
            quickEmojis.forEach(e => { html += `<button class="emoji-btn" onclick="addEmoji('${e}')">${e}</button>`; });
            panel.innerHTML = html;
        }
        panel.style.display = 'grid';
    } else { panel.style.display = 'none'; }
}

function addEmoji(emoji) {
    const input = document.getElementById('msgInput');
    input.value += emoji;
    input.focus();
}

function handleMentionInput(event) {
    const input = event.target;
    const val = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
    const popup = document.getElementById('mentionPopup');
    if (match) {
        const query = match[1].toLowerCase();
        database.ref('users').once('value').then(snap => {
            allUsersCache = [];
            snap.forEach(child => {
                const u = child.val();
                if(u.username && u.username.toLowerCase().includes(query) && child.key !== localStorage.getItem('myUserId')) {
                    allUsersCache.push(u);
                }
            });
            if(allUsersCache.length > 0) {
                let html = '';
                allUsersCache.slice(0, 5).forEach(u => {
                    html += `<div class="mention-item" onclick="insertMention('${u.username}')">@${u.username}</div>`;
                });
                popup.innerHTML = html;
                popup.style.display = 'flex';
            } else { popup.style.display = 'none'; }
        });
    } else { popup.style.display = 'none'; }
}function insertMention(username) {
    const input = document.getElementById('msgInput');
    const val = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const textAfterCursor = val.slice(cursorPos);
    input.value = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, '@' + username + ' ') + textAfterCursor;
    input.focus();
    document.getElementById('mentionPopup').style.display = 'none';
}

document.getElementById('msgInput').addEventListener('input', () => {
    const myId = localStorage.getItem('myUserId');
    if (!myId || !currentRoomId) return;
    database.ref(`users/${myId}`).once('value').then(uSnap => {
        const myData = uSnap.val();
        const myName = myData ? (myData.displayName || myData.username) : "Кто-то";
        database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: true, name: myName });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false }); }, 2000);
    });
});

function spawnReactionEffect(event, emoji) {
    if(!event) return;
    const x = event.clientX || (event.touches && event.touches[0].clientX) || 0;
    const y = event.clientY || (event.touches && event.touches[0].clientY) || 0;
    for(let i=0; i<5; i++) {
        const p = document.createElement('div');
        p.className = 'reaction-particle';
        p.textContent = emoji;
        p.style.left = x + 'px'; p.style.top = y + 'px';
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 60;
        p.style.setProperty('--x', Math.cos(angle) * distance + 'px');
        p.style.setProperty('--y', Math.sin(angle) * distance + 'px');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 600);
    }
}function showMessageActions(event, msgId, isMine) {
    if(event) event.stopPropagation(); 
    const msg = messagesCache[msgId];
    if(!msg) return;
    currentMenuMsgId = msgId;
    clearTimeout(menuCloseTimeout);
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('msgContextMenu');
    if(overlay) { overlay.style.display = 'block'; setTimeout(() => overlay.classList.add('show'), 10); }
    if(menu) { menu.style.display = 'flex'; setTimeout(() => menu.classList.add('show'), 10); }
    const rect = event.target.getBoundingClientRect();
    if(menu) {
        menu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
        menu.style.top = Math.max(10, rect.top - 120) + 'px'; 
    }
    const quickReacts = ['❤️', '👍', '🔥', '😂', '😢'];
    let reactHTML = `<div class="reaction-list-5">`;
    quickReacts.forEach(e => {
        reactHTML += `<button onclick="toggleReaction(event, '${currentRoomId}', '${msgId}', '${e}'); closeContextMenu();">${e}</button>`;
    });
    reactHTML += `</div><button class="btn-more-reactions" onclick="openFullReactions('${msgId}')">»</button>`;
    const reactionsDiv = document.getElementById('contextReactions');
    if(reactionsDiv) reactionsDiv.innerHTML = reactHTML;

    const actionsDiv = document.getElementById('contextActions');
    if(actionsDiv) {
        actionsDiv.innerHTML = `<button onclick="setReply('${msgId}'); closeContextMenu();">↩️ Ответить</button>`;
        const isChannel = currentRoomId.startsWith('ch_');
        const isGlobal = currentRoomId === 'global';
        if (isMine || (!isChannel && !isGlobal)) {
            actionsDiv.innerHTML += `<button class="red-btn" onclick="deleteMessage('${currentRoomId}', '${msgId}'); closeContextMenu();">🗑️ Удалить</button>`;
        }
        if (isMine && !msg.image && !msg.audio) {
            actionsDiv.innerHTML += `<button onclick="editMessage('${msgId}'); closeContextMenu();">✏️ Изменить</button>`;
        }
    }
}function openFullReactions(msgId) {
    currentMenuMsgId = msgId;
    const grid = document.getElementById('fullReactionsGrid');
    const allEmojis = ['🤝','😎','💀','🙏','😭','🤔','😞','😯','👎','❤️‍🔥','👍','🔥','❤️','😂','😢','😡','🎉','🥳','🤩','😍','🤮','🤡','💩','👻','🤖','💯','👀','👌'];
    let html = '';
    allEmojis.forEach(e => {
        html += `<button onclick="toggleReaction(event, '${currentRoomId}', '${msgId}', '${e}'); closeFullReactions(); closeContextMenu();">${e}</button>`;
    });
    grid.innerHTML = html;
    showModal('fullReactionsModal');
}
function closeFullReactions() { hideModal('fullReactionsModal'); }

function closeContextMenu() {
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('msgContextMenu');
    if(overlay) overlay.classList.remove('show');
    if(menu) menu.classList.remove('show');
    menuCloseTimeout = setTimeout(() => {
        if(overlay) overlay.style.display = 'none';
        if(menu) menu.style.display = 'none';
    }, 200);
    currentMenuMsgId = null;
}

function editMessage(msgId) {
    const msg = messagesCache[msgId];
    if(!msg || msg.image || msg.audio) return;
    const newText = prompt("Изменить сообщение:", msg.text);
    if (newText !== null && newText.trim() !== "" && newText !== msg.text) {
        database.ref(`chats/${currentRoomId}/${msgId}`).update({ text: newText, edited: true });
    }
}function setReply(msgId) {
    const msg = messagesCache[msgId];
    if(!msg) return;
    activeReplyContext = { name: msg.username || 'Аноним', text: msg.text };
    const rp = document.getElementById('replyPreview');
    if(rp) {
        rp.style.display = 'flex';
        document.getElementById('replyPreviewName').textContent = activeReplyContext.name;
        document.getElementById('replyPreviewText').textContent = activeReplyContext.text;
    }
    document.getElementById('msgInput').focus();
}

function cancelReply() {
    activeReplyContext = null;
    const rp = document.getElementById('replyPreview');
    if(rp) rp.style.display = 'none';
}

function toggleReaction(event, roomId, msgId, emoji) {
    spawnReactionEffect(event, emoji);
    const myId = localStorage.getItem('myUserId');
    database.ref(`chats/${roomId}/${msgId}/reactions`).transaction((reactions) => {
        reactions = reactions || {};
        let hasReacted = false;
        if (reactions[emoji] && reactions[emoji].includes(myId)) hasReacted = true;
        for (let key in reactions) {
            if (Array.isArray(reactions[key]) && reactions[key].includes(myId)) {
                reactions[key] = reactions[key].filter(id => id !== myId);
                if (reactions[key].length === 0) delete reactions[key];
            }
        }
        if (!hasReacted) {
            if (!reactions[emoji]) reactions[emoji] = [];
            reactions[emoji].push(myId);
        }
        return reactions;
    });
}

function deleteMessage(roomId, msgId) { if(confirm("Удалить сообщение?")) database.ref(`chats/${roomId}/${msgId}`).remove(); }function deleteChatFromProfile() {
    if(currentRoomId === 'global' || currentRoomId.startsWith('ch_') || currentRoomId.startsWith('gr_')) return;
    if(confirm("Удалить этот чат?")) {
        const myId = localStorage.getItem('myUserId');
        database.ref(`userChats/${myId}/${currentRoomId}`).remove().then(() => {
            database.ref(`chats/${currentRoomId}`).remove().then(() => { closeProfileModal(); closeChat(); loadMyChatsList(); });
        });
    }
}

function openCreateModal() { showModal('createModal'); }
function closeCreateModal() { hideModal('createModal'); }
function closeProfileModal() { hideModal('profileModal'); }

function leaveChannel() {
    const myId = localStorage.getItem('myUserId');
    if(!currentProfileChannelId) return;
    if(!confirm("Выйти?")) return;
    const isGroup = currentProfileChannelId.startsWith('gr_');
    const dbRef = isGroup ? `groups/${currentProfileChannelId}/members/${myId}` : `channels/${currentProfileChannelId}/subscribersList/${myId}`;
    
    database.ref(dbRef).remove().then(() => {
        if(!isGroup) database.ref('channels/' + currentProfileChannelId + '/subscribers').transaction((subs) => (subs || 1) - 1);
        database.ref(`userChats/${myId}/${currentProfileChannelId}`).remove();
        
        if (isGroup) {
            database.ref(`users/${myId}`).once('value').then(snap => {
                const name = snap.val() ? (snap.val().displayName || snap.val().username) : "Пользователь";
                const msg = { type: 'system', text: `${name} вышел из группы`, timestamp: Date.now(), userId: 'system' };
                database.ref('chats/' + currentProfileChannelId).push(msg);
            });
        }
        closeProfileModal(); closeChat(); loadMyChatsList(); alert("Вы вышли.");
    });
}function toggleBlockUser() {
    if (!currentProfileUid) return;
    const myId = localStorage.getItem('myUserId');
    const blockRef = database.ref(`users/${myId}/blocked/${currentProfileUid}`);
    blockRef.once('value').then(snap => {
        if (snap.exists()) {
            blockRef.remove().then(() => {
                document.getElementById('blockUserBtn').textContent = "🚫 Заблокировать";
                document.getElementById('blockUserBtn').style.background = "#e67e22";
                document.getElementById('writeMessageBtn').style.display = 'block';
                loadBlockedUsersList();
                if (currentRoomId.includes(currentProfileUid)) loadChat(currentRoomId, document.getElementById('chatTitle').textContent);
            });
        } else {
            const delChat = confirm("Заблокировать? ОК = Удалить чат. Отмена = Оставить.");
            blockRef.set(true).then(() => {
                if(delChat) {
                    const roomId = [myId, currentProfileUid].sort().join('_');
                    database.ref(`userChats/${myId}/${roomId}`).remove();
                    database.ref(`chats/${roomId}`).remove();
                    closeProfileModal(); closeChat();
                } else {
                    document.getElementById('blockUserBtn').textContent = "✅ Разблокировать";
                    document.getElementById('blockUserBtn').style.background = "#2ecc71";
                    document.getElementById('writeMessageBtn').style.display = 'none';
                    if (currentRoomId.includes(currentProfileUid)) loadChat(currentRoomId, document.getElementById('chatTitle').textContent);
                }
                loadBlockedUsersList();
            });
        }
    });
}function unblockCurrentUser() {
    const myId = localStorage.getItem('myUserId');
    if (!currentRoomId || currentRoomId === 'global' || currentRoomId.startsWith('ch_') || currentRoomId.startsWith('gr_')) return;
    const otherUid = currentRoomId.split('_').find(id => id !== myId);
    database.ref(`users/${myId}/blocked/${otherUid}`).remove().then(() => { loadChat(currentRoomId, document.getElementById('chatTitle').textContent); loadBlockedUsersList(); });
}

function loadBlockedUsersList() {
    const myId = localStorage.getItem('myUserId');
    const listDiv = document.getElementById('blockedList');
    if(!listDiv) return;
    listDiv.innerHTML = "Загрузка...";
    database.ref(`users/${myId}/blocked`).once('value').then(snap => {
        listDiv.innerHTML = "";
        if(!snap.exists()) { listDiv.innerHTML = "<span style='color:gray;'>Нет заблокированных</span>"; return; }
        snap.forEach(child => {
            const blockedUid = child.key;
            database.ref(`users/${blockedUid}`).once('value').then(uSnap => {
                const uData = uSnap.val();
                if(uData) {
                    const div = document.createElement('div');
                    div.style = 'display:flex; justify-content:space-between; align-items:center;';
                    div.innerHTML = `<span>@${uData.username}</span><button onclick="unblockFromSettings('${blockedUid}')" style="background:#2ecc71; border:none; padding:5px 10px; border-radius:5px; color:white;">Разблокировать</button>`;
                    listDiv.appendChild(div);
                }
            });
        });
    });
}
function unblockFromSettings(uid) {
    const myId = localStorage.getItem('myUserId');
    database.ref(`users/${myId}/blocked/${uid}`).remove().then(() => { loadBlockedUsersList(); });
}function openProfileModal(targetUid = null) {
    if (!targetUid && currentRoomId === 'global') return;
    const av = document.getElementById('profAvatar'); const name = document.getElementById('profName');
    const uname = document.getElementById('profUsername'); const bio = document.getElementById('profBio');
    const subs = document.getElementById('profSubs'); const leaveBtn = document.getElementById('leaveChannelBtn');
    const deleteChatBtn = document.getElementById('deleteChatBtn'); const writeBtn = document.getElementById('writeMessageBtn');
    const blockBtn = document.getElementById('blockUserBtn'); const muteCont = document.getElementById('muteSettingContainer');
    const showMembersBtn = document.getElementById('showMembersBtn');
    
    if(!document.getElementById('profileModal')) return;
    name.textContent = "Загрузка..."; showModal('profileModal');
    [leaveBtn, deleteChatBtn, writeBtn, blockBtn, muteCont, showMembersBtn].forEach(btn => { if(btn) btn.style.display = 'none'; });
    bio.textContent = ''; av.style.backgroundImage = 'none';

    if (targetUid) {
        currentProfileUid = targetUid; currentProfileChannelId = null; loadUserProfileInModal(targetUid);
    } else if (currentRoomId.startsWith('ch_') || currentRoomId.startsWith('gr_')) {
        currentProfileChannelId = currentRoomId; currentProfileUid = null;
        const isGroup = currentRoomId.startsWith('gr_'); const dbRef = isGroup ? 'groups/' : 'channels/';
        if(muteCont) muteCont.style.display = 'flex';
        database.ref(`userChats/${localStorage.getItem('myUserId')}/${currentRoomId}/muted`).once('value').then(mSnap => { document.getElementById('muteToggle').checked = mSnap.val() === true; });
        database.ref(dbRef + currentRoomId).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.name; uname.textContent = '@' + data.username;
                av.textContent = isGroup ? 'G' : '#'; av.style.backgroundColor = isGroup ? '#2ecc71' : '#e67e22';
                subs.textContent = isGroup ? "Групповой чат" : (data.subscribers || 1) + " подписчиков";
                if(leaveBtn) leaveBtn.style.display = 'block';
                if(showMembersBtn) showMembersBtn.style.display = 'block';
            }
        });
    } else {
        currentProfileChannelId = null;
        const otherUid = currentRoomId.split('_').find(id => id !== localStorage.getItem('myUserId'));
        if(otherUid) { 
            currentProfileUid = otherUid; loadUserProfileInModal(otherUid); 
            if(deleteChatBtn) deleteChatBtn.style.display = 'block'; if(muteCont) muteCont.style.display = 'flex';
            database.ref(`userChats/${localStorage.getItem('myUserId')}/${currentRoomId}/muted`).once('value').then(mSnap => { document.getElementById('muteToggle').checked = mSnap.val() === true; });
        }
    }
}function loadUserProfileInModal(uid) {
    const av = document.getElementById('profAvatar'); const name = document.getElementById('profName');
    const uname = document.getElementById('profUsername'); const bio = document.getElementById('profBio');
    const subs = document.getElementById('profSubs'); const writeBtn = document.getElementById('writeMessageBtn');
    const blockBtn = document.getElementById('blockUserBtn'); const myId = localStorage.getItem('myUserId');

    database.ref('users/' + uid).once('value').then((snap) => {
        const data = snap.val();
        if(data) {
            name.textContent = data.displayName || data.username || "Без имени"; uname.textContent = '@' + (data.username || "unknown");
            bio.textContent = data.bio || "Описание не добавлено...";
            if(data.avatarUrl) { av.textContent = ''; av.style.backgroundImage = `url(${data.avatarUrl})`; av.style.backgroundColor = 'transparent'; }
            else { av.textContent = data.avatar || (data.username ? data.username[0].toUpperCase() : '?'); av.style.backgroundColor = '#4fc3f7'; }
            database.ref('status/' + uid).once('value').then(sSnap => {
                const status = sSnap.val();
                if(status && status.state === 'online') subs.innerHTML = `Пользователь <span class="online-dot"></span>`;
                else subs.textContent = "Пользователь (офлайн)";
            });
            if (uid !== myId) {
                database.ref(`users/${myId}/blocked/${uid}`).once('value').then(bSnap => {
                    if(bSnap.exists()) {
                        if(blockBtn) { blockBtn.style.display = 'block'; blockBtn.textContent = "✅ Разблокировать"; blockBtn.style.background = "#2ecc71"; }
                        if(writeBtn) writeBtn.style.display = 'none';
                    } else {
                        if(blockBtn) { blockBtn.style.display = 'block'; blockBtn.textContent = "🚫 Заблокировать"; blockBtn.style.background = "#e67e22"; }
                        if(writeBtn) writeBtn.style.display = 'block';
                    }
                });
            }
        }
    });
}

function startChatFromProfile() {
    if (!currentProfileUid) return;
    const myId = localStorage.getItem('myUserId');
    const roomId = [myId, currentProfileUid].sort().join('_'); 
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val(); const myUsername = myData ? (myData.displayName || myData.username) : "Аноним"; const myAvatar = myData ? myData.avatarUrl : null;
        database.ref('users/' + currentProfileUid).once('value').then((otherSnap) => {
            const otherData = otherSnap.val(); const otherName = otherData ? (otherData.displayName || otherData.username) : "Собеседник";
            database.ref(`userChats/${myId}/${roomId}`).update({ username: otherName, lastMessage: "Чат создан", unreadCount: 0 });
            database.ref(`userChats/${currentProfileUid}/${roomId}`).update({ username: myUsername, avatarUrl: myAvatar, lastMessage: "Чат создан", unreadCount: 0 });
            closeProfileModal(); openChat(roomId, otherName, null);
        });
    });
}function createChannel(btn) {
    const name = document.getElementById('chName').value.trim();
    const username = document.getElementById('chUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const isPrivate = document.getElementById('chPrivate').checked;
    const isGroup = document.getElementById('chIsGroup').checked;
    const myId = localStorage.getItem('myUserId');
    if (!name || !username) return alert("Заполни все поля!");
    btn.disabled = true;
    
    database.ref('usernames/' + username).once('value').then((snap) => {
        if (snap.exists()) { btn.disabled = false; return alert("Юзернейм занят!"); }
        const inviteCode = Math.random().toString(36).substring(2, 10);
        const channelId = (isGroup ? 'gr_' : 'ch_') + Date.now();
        const dbRef = isGroup ? 'groups/' : 'channels/';
        
        database.ref(dbRef + channelId).set({ name: name, username: username, isPrivate: isPrivate, inviteCode: inviteCode, owner: myId, createdAt: Date.now() }).then(() => {
            if (isGroup) { database.ref(`groups/${channelId}/members/${myId}`).set(true); }
            else { database.ref(`channels/${channelId}/subscribers`).set(1); database.ref(`channels/${channelId}/subscribersList/${myId}`).set(true); }
            database.ref('usernames/' + username).set({ type: isGroup ? 'group' : 'channel', id: channelId });
            database.ref(`userChats/${myId}/${channelId}`).set({ username: name, lastMessage: isGroup ? "Группа создана!" : "Канал создан!", unreadCount: 0 });
            alert(isGroup ? "Группа создана!" : "Канал создан!");
            btn.disabled = false; closeCreateModal(); loadMyChatsList();
        });
    });
}

function joinChannelByCode() {
    const code = document.getElementById('joinCode').value.trim();
    const myId = localStorage.getItem('myUserId');
    if (!code) return alert("Введи код!");
    const joinProcess = (dbRef, isGroup) => {
        database.ref(dbRef).orderByChild('inviteCode').equalTo(code).once('value', (snapshot) => {
            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    const id = child.key; const data = child.val();
                    if (isGroup) database.ref(`groups/${id}/members/${myId}`).set(true);
                    else { database.ref(`channels/${id}/subscribersList/${myId}`).set(true); database.ref(`channels/${id}/subscribers`).transaction(s => (s||0)+1); }
                    database.ref(`userChats/${myId}/${id}`).set({ username: data.name, lastMessage: "Вы вошли", unreadCount: 0 }).then(() => {
                        alert("Успешно!"); closeCreateModal(); loadMyChatsList(); openChat(id, data.name, null);
                    });
                });
            }
        });
    };
    database.ref('channels').orderByChild('inviteCode').equalTo(code).once('value').then(s => {
        if(s.exists()) joinProcess('channels', false); else joinProcess('groups', true);
    });
}function showMembersList() {
    if (!currentProfileChannelId) return;
    showModal('membersModal');
    const isGroup = currentProfileChannelId.startsWith('gr_');
    const dbRef = isGroup ? `groups/${currentProfileChannelId}/members` : `channels/${currentProfileChannelId}/subscribersList`;
    const container = document.getElementById('membersListContainer');
    document.getElementById('membersModalTitle').textContent = isGroup ? "Участники" : "Подписчики";
    container.innerHTML = "Загрузка...";
    
    database.ref(dbRef).once('value').then(snap => {
        container.innerHTML = "";
        if(!snap.exists()) { container.innerHTML = "<span style='color:gray;'>Пусто</span>"; return; }
        database.ref((isGroup ? 'groups/' : 'channels/') + currentProfileChannelId + '/owner').once('value').then(oSnap => {
            const ownerId = oSnap.val(); const myId = localStorage.getItem('myUserId');
            snap.forEach(child => {
                const uid = child.key;
                database.ref('users/' + uid).once('value').then(uSnap => {
                    const u = uSnap.val(); if(!u) return;
                    const div = document.createElement('div');
                    div.style = 'display:flex; justify-content:space-between; align-items:center;';
                    div.innerHTML = `<span onclick="hideModal('membersModal'); openProfileModal('${uid}')" style="cursor:pointer; color: #4fc3f7; text-decoration: underline;">@${u.username}</span>`;
                    if (ownerId === myId && uid !== myId) {
                        const kickBtn = document.createElement('button');
                        kickBtn.textContent = "Кик"; kickBtn.style = "background:#e74c3c; border:none; padding:5px 10px; border-radius:5px; color:white; cursor:pointer;";
                        kickBtn.onclick = () => kickMember(uid, isGroup);
                        div.appendChild(kickBtn);
                    }
                    container.appendChild(div);
                });
            });
        });
    });
}

function kickMember(uid, isGroup) {
    if(!confirm("Выгнать?")) return;
    const dbRef = isGroup ? `groups/${currentProfileChannelId}/members/${uid}` : `channels/${currentProfileChannelId}/subscribersList/${uid}`;
    database.ref(dbRef).remove().then(() => {
        if(!isGroup) database.ref(`channels/${currentProfileChannelId}/subscribers`).transaction(s => (s||1)-1);
        database.ref(`userChats/${uid}/${currentProfileChannelId}`).remove();
        showMembersList();
    });
}