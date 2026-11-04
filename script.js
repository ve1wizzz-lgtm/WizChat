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
let currentProfileChannelId = null; 
let activeReplyContext = null;
let messagesCache = {}; 
let typingTimeout;
let tempAvatarBase64 = null;
let previousUnread = {}; 
let currentMenuMsgId = null;

function setupOnlineStatus(uid) {
    const isOffline = { state: 'offline', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const isOnline = { state: 'online', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const userRef = database.ref('/status/' + uid);
    database.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() == false) return;
        userRef.onDisconnect().set(isOffline).then(() => { userRef.set(isOnline); });
    });
}

document.addEventListener("DOMContentLoaded", () => {
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

document.getElementById('msgInput').addEventListener('input', () => {
    const myId = localStorage.getItem('myUserId');
    if (!myId || !currentRoomId) return;
    database.ref(`users/${myId}`).once('value').then(uSnap => {
        const myData = uSnap.val();
        const myName = myData ? (myData.displayName || myData.username) : "Кто-то"; 
        database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: true, name: myName });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false });
        }, 2000); 
    });
});

function showMessageActions(event, msgId, isMine) {
    if(event) event.stopPropagation(); 
    const msg = messagesCache[msgId];
    if(!msg) return;
    currentMenuMsgId = msgId;
    
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('msgContextMenu');
    
    if(overlay) overlay.style.display = 'block';
    if(menu) menu.style.display = 'flex';
    
    const rect = event.target.getBoundingClientRect();
    if(menu) {
        menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
        menu.style.top = (rect.top - 100) + 'px'; 
    }

    const reactionsDiv = document.getElementById('contextReactions');
    if(reactionsDiv) {
        reactionsDiv.innerHTML = `
            <button onclick="toggleReaction('${currentRoomId}', '${msgId}', '👍'); closeContextMenu();">👍</button>
            <button onclick="toggleReaction('${currentRoomId}', '${msgId}', '🔥'); closeContextMenu();">🔥</button>
            <button onclick="toggleReaction('${currentRoomId}', '${msgId}', '❤️'); closeContextMenu();">❤️</button>
        `;
    }
    const actionsDiv = document.getElementById('contextActions');
    if(actionsDiv) {
        actionsDiv.innerHTML = `<button onclick="setReply('${msgId}'); closeContextMenu();">↩️ Ответить</button>`;
        if (isMine) {
            actionsDiv.innerHTML += `<button onclick="editMessage('${msgId}'); closeContextMenu();">✏️ Изменить</button>`;
            actionsDiv.innerHTML += `<button class="red-btn" onclick="deleteMessage('${currentRoomId}', '${msgId}'); closeContextMenu();">🗑️ Удалить</button>`;
        }
    }
}

function closeContextMenu() {
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('msgContextMenu');
    if(overlay) overlay.style.display = 'none';
    if(menu) menu.style.display = 'none';
    currentMenuMsgId = null;
}

// Убираем глобальный слушатель document click, так как теперь есть overlay

function editMessage(msgId) {
    const msg = messagesCache[msgId];
    if(!msg) return;
    const newText = prompt("Изменить сообщение:", msg.text);
    if (newText !== null && newText.trim() !== "" && newText !== msg.text) {
        database.ref(`chats/${currentRoomId}/${msgId}`).update({ text: newText, edited: true });
        const myId = localStorage.getItem('myUserId');
        if(currentRoomId !== 'global') {
            database.ref(`userChats/${myId}/${currentRoomId}`).once('value').then(s => {
                if(s.val() && s.val().lastMessage === msg.text) {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: newText });
                    if(!currentRoomId.startsWith('ch_')) {
                        const otherUid = currentRoomId.split('_').find(id => id !== myId);
                        database.ref(`userChats/${otherUid}/${currentRoomId}`).once('value').then(os => {
                            if(os.val() && os.val().lastMessage === msg.text) {
                                database.ref(`userChats/${otherUid}/${currentRoomId}`).update({ lastMessage: newText });
                            }
                        });
                    }
                }
            });
        }
    }
}

function setReply(msgId) {
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

function toggleReaction(roomId, msgId, emoji) {
    const myId = localStorage.getItem('myUserId');
    const ref = database.ref(`chats/${roomId}/${msgId}/reactions/${emoji}`);
    ref.once('value').then((snap) => {
        let users = snap.val() || [];
        if(users.includes(myId)) { users = users.filter(id => id !== myId); } 
        else { users.push(myId); }
        ref.set(users);
    });
}

function deleteMessage(roomId, msgId) { if(confirm("Удалить сообщение для всех?")) database.ref(`chats/${roomId}/${msgId}`).remove(); }

function deleteChatFromProfile() {
    if(currentRoomId === 'global' || currentRoomId.startsWith('ch_')) return;
    if(confirm("Удалить этот чат из вашего списка? (Вся история переписки будет удалена)")) {
        const myId = localStorage.getItem('myUserId');
        database.ref(`userChats/${myId}/${currentRoomId}`).remove().then(() => {
            database.ref(`chats/${currentRoomId}`).remove().then(() => {
                closeProfileModal(); closeChat(); loadMyChatsList();
            });
        });
    }
}

function openCreateModal() { const m = document.getElementById('createModal'); if(m) m.style.display = 'flex'; }
function closeCreateModal() { const m = document.getElementById('createModal'); if(m) m.style.display = 'none'; }
function closeProfileModal() { const m = document.getElementById('profileModal'); if(m) m.style.display = 'none'; }function leaveChannel() {
    const myId = localStorage.getItem('myUserId');
    if(!currentProfileChannelId) return;
    if(!confirm("Вы уверены, что хотите отписаться?")) return;
    database.ref(`userChats/${myId}/${currentProfileChannelId}`).remove().then(() => {
        database.ref('channels/' + currentProfileChannelId + '/subscribers').transaction((subs) => (subs || 1) - 1);
        closeProfileModal(); closeChat(); loadMyChatsList(); alert("Вы отписались.");
    });
}

function openProfileModal() {
    if (currentRoomId === 'global') return;
    const modal = document.getElementById('profileModal');
    const av = document.getElementById('profAvatar');
    const name = document.getElementById('profName');
    const uname = document.getElementById('profUsername');
    const subs = document.getElementById('profSubs');
    const leaveBtn = document.getElementById('leaveChannelBtn');
    const deleteChatBtn = document.getElementById('deleteChatBtn');
    if(!modal) return;
    name.textContent = "Загрузка..."; modal.style.display = 'flex'; 
    if(leaveBtn) leaveBtn.style.display = 'none';
    if(deleteChatBtn) deleteChatBtn.style.display = 'none';
    av.style.backgroundImage = 'none';

    if (currentRoomId.startsWith('ch_')) {
        currentProfileChannelId = currentRoomId;
        database.ref('channels/' + currentRoomId).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.name; uname.textContent = '@' + data.username;
                av.textContent = '#'; av.style.background = '#e67e22'; av.style.backgroundColor = '#e67e22';
                subs.textContent = (data.subscribers || 1) + " подписчиков";
                if(leaveBtn) leaveBtn.style.display = 'block';
            }
        });
    } else {
        if(deleteChatBtn) deleteChatBtn.style.display = 'block';
        const otherUid = currentRoomId.split('_').find(id => id !== localStorage.getItem('myUserId'));
        if(!otherUid) return;
        database.ref('users/' + otherUid).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.displayName || data.username || "Без имени"; 
                uname.textContent = '@' + (data.username || "unknown");
                if(data.avatarUrl) {
                    av.textContent = ''; av.style.backgroundImage = `url(${data.avatarUrl})`; av.style.backgroundColor = 'transparent';
                } else {
                    av.textContent = data.avatar || (data.username ? data.username[0].toUpperCase() : '?'); av.style.backgroundColor = '#4fc3f7';
                }
                database.ref('status/' + otherUid).once('value').then(sSnap => {
                    const status = sSnap.val();
                    if(status && status.state === 'online') subs.innerHTML = `Пользователь <span class="online-dot"></span>`;
                    else subs.textContent = "Пользователь (офлайн)";
                });
            }
        });
    }
}

function createChannel(btn) {
    const name = document.getElementById('chName').value.trim();
    const username = document.getElementById('chUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const isPrivate = document.getElementById('chPrivate').checked;
    const myId = localStorage.getItem('myUserId');
    if (!name || !username) return alert("Заполни все поля!");
    btn.disabled = true;
    database.ref('usernames/' + username).once('value').then((snap) => {
        if (snap.exists()) { btn.disabled = false; return alert("Юзернейм занят!"); }
        const inviteCode = Math.random().toString(36).substring(2, 10);
        const channelId = 'ch_' + Date.now();
        const channelData = { name: name, username: username, isPrivate: isPrivate, inviteCode: inviteCode, owner: myId, subscribers: 1, createdAt: Date.now() };
        database.ref('channels/' + channelId).set(channelData).then(() => {
            database.ref('usernames/' + username).set({ type: 'channel', id: channelId });
            database.ref(`userChats/${myId}/${channelId}`).set({ username: name, lastMessage: "Канал создан!", unreadCount: 0 });
            if (isPrivate) alert(`Секретный код: ${inviteCode}`); else alert("Публичный канал создан!");
            btn.disabled = false; closeCreateModal(); loadMyChatsList();
        });
    });
}

function joinChannelByCode() {
    const code = document.getElementById('joinCode').value.trim();
    const myId = localStorage.getItem('myUserId');
    if (!code) return alert("Введи код!");
    database.ref('channels').orderByChild('inviteCode').equalTo(code).once('value', (snapshot) => {
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const channelId = child.key; const chData = child.val();
                database.ref(`userChats/${myId}/${channelId}`).set({ username: chData.name, lastMessage: "Вы вошли", unreadCount: 0 }).then(() => {
                    database.ref('channels/' + channelId + '/subscribers').transaction((subs) => (subs || 0) + 1);
                    alert("Успешно!"); closeCreateModal(); loadMyChatsList(); openChat(channelId, chData.name, null);
                });
            });
        } else { alert("Неверный код."); }
    });
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    if(tab) tab.classList.add('active'); 
    if(element) element.classList.add('active');
}

function applySettings() {
    const theme = localStorage.getItem('appTheme');
    if (theme === 'light') document.body.classList.add('light-theme'); else document.body.classList.remove('light-theme');
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add('font-' + (localStorage.getItem('msgFontSize') || 'medium'));
}
function changeTheme(theme) { localStorage.setItem('appTheme', theme); applySettings(); }
function changeFontSize(size) { localStorage.setItem('msgFontSize', size); applySettings(); }
applySettings();

function registerUser() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if(!username || password.length < 6) { return alert("Пароль мин. 6 символов!"); }
    database.ref('usernames/' + username).once('value').then((snap) => {
        if(snap.exists()) return alert("Ник занят!");
        auth.createUserWithEmailAndPassword(username + "@wizchat.com", password).then((user) => {
            database.ref('users/' + user.user.uid).set({ username: username, displayName: username, avatar: username[0].toUpperCase() });
            database.ref('usernames/' + username).set({ type: 'user', id: user.user.uid });
            alert("Успешно!");
        }).catch((error) => alert(error.message));
    });
}

function loginUser() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    auth.signInWithEmailAndPassword(username + "@wizchat.com", password).catch(() => alert("Неверный логин или пароль!"));
}

function logoutUser() { auth.signOut(); location.reload(); }

auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('authScreen').style.display = 'none'; 
        document.getElementById('mainApp').style.display = 'flex';
        document.getElementById('bottomNav').style.display = 'flex'; 
        localStorage.setItem('myUserId', user.uid); 
        setupOnlineStatus(user.uid); 
        loadChat('global', 'Общий чат'); 
        loadMyChatsList(); 
        loadProfile(); 
    } else {
        document.getElementById('authScreen').style.display = 'flex'; 
        document.getElementById('mainApp').style.display = 'none';
        localStorage.removeItem('myUserId');
    }
});

function loadProfile() {
    const myId = localStorage.getItem('myUserId');
    database.ref('users/' + myId).on('value', (snapshot) => {
        const data = snapshot.val();
        if(data) {
            document.getElementById('profileDisplayName').textContent = data.displayName || data.username;
            document.getElementById('profileUsername').textContent = '@' + data.username;
            document.getElementById('newDisplayName').value = data.displayName || data.username;
            document.getElementById('newAvatarUrl').value = data.avatarUrl || '';
            const profAvatar = document.getElementById('profileAvatar');
            if(data.avatarUrl) {
                profAvatar.textContent = ''; profAvatar.style.backgroundImage = `url(${data.avatarUrl})`; profAvatar.style.backgroundColor = 'transparent';
            } else {
                profAvatar.style.backgroundImage = 'none'; profAvatar.textContent = data.avatar || data.username[0].toUpperCase(); profAvatar.style.backgroundColor = '#4fc3f7';
            }
        }
    });
}function saveProfile() {
    const myId = localStorage.getItem('myUserId');
    const newName = document.getElementById('newDisplayName').value.trim();
    const newAvatarUrl = document.getElementById('newAvatarUrl').value.trim();
    if(!newName) return alert("Введите имя!");
    let finalAvatar = tempAvatarBase64 ? tempAvatarBase64 : newAvatarUrl;
    database.ref('users/' + myId).update({ displayName: newName, avatarUrl: finalAvatar }).then(() => {
        database.ref(`userChats/${myId}`).once('value').then(snap => {
            snap.forEach(child => {
                const roomId = child.key;
                if(!roomId.startsWith('ch_')) {
                    const otherUid = roomId.split('_').find(id => id !== myId);
                    if(otherUid) { database.ref(`userChats/${otherUid}/${roomId}`).update({ username: newName, avatarUrl: finalAvatar }); }
                }
            });
        });
        alert("Профиль обновлен!"); tempAvatarBase64 = null; 
    });
}

function liveSearch() {
    const searchName = document.getElementById('searchInput').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    const myId = localStorage.getItem('myUserId');
    if (!searchName) { if(resultsDiv) resultsDiv.style.display = 'none'; return; }
    if(resultsDiv) { resultsDiv.style.display = 'block'; resultsDiv.innerHTML = '<div style="padding:10px; color:gray;">Поиск...</div>'; }
    database.ref('users').once('value', (userSnap) => {
        if(resultsDiv) resultsDiv.innerHTML = ''; 
        let found = false;
        userSnap.forEach((child) => {
            const user = child.val(); const uid = child.key;
            if (user.username && user.username.includes(searchName) && uid !== myId) {
                found = true; const div = document.createElement('div'); div.className = 'search-user-item';
                let avStyle = user.avatarUrl ? `background-image:url(${user.avatarUrl}); color:transparent;` : `background-color:#4fc3f7;`;
                let avText = user.avatarUrl ? '' : (user.avatar || (user.username ? user.username[0] : '?'));
                div.innerHTML = `<div class="avatar-placeholder" style="${avStyle}">${avText}</div><div>👤 @${user.username} <span style="color:gray; font-size:12px;">(${user.displayName || user.username})</span></div>`;
                div.onclick = () => startPrivateChat(uid, user.displayName || user.username); if(resultsDiv) resultsDiv.appendChild(div);
            }
        });
        database.ref('channels').orderByChild('isPrivate').equalTo(false).once('value', (chSnap) => {
            chSnap.forEach((child) => {
                const ch = child.val(); const chId = child.key;
                if (ch.username && ch.username.includes(searchName)) {
                    found = true; const div = document.createElement('div'); div.className = 'search-user-item';
                    div.innerHTML = `<div class="avatar-placeholder" style="background: #e67e22;">#</div><div>📢 ${ch.name} (@${ch.username})</div>`;
                    div.onclick = () => joinPublicChannel(chId, ch.name); if(resultsDiv) resultsDiv.appendChild(div);
                }
            });
            if (!found && resultsDiv) resultsDiv.innerHTML = '<div style="padding:10px; color:gray;">Никого не найдено</div>';
        });
    });
}

function joinPublicChannel(channelId, name) {
    const myId = localStorage.getItem('myUserId');
    database.ref(`userChats/${myId}/${channelId}`).set({ username: name, lastMessage: "Вы подписались", unreadCount: 0 }).then(() => {
        database.ref('channels/' + channelId + '/subscribers').transaction((subs) => (subs || 0) + 1);
        document.getElementById('searchInput').value = ''; const sR = document.getElementById('searchResults'); if(sR) sR.style.display = 'none';
        loadMyChatsList(); openChat(channelId, name, null);
    });
}

function startPrivateChat(otherUid, otherDisplayName) {
    const myId = localStorage.getItem('myUserId');
    const roomId = [myId, otherUid].sort().join('_'); 
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val(); const myUsername = myData ? (myData.displayName || myData.username) : "Аноним";
        database.ref(`userChats/${myId}/${roomId}`).update({ username: otherDisplayName, lastMessage: "Чат создан", unreadCount: 0 });
        database.ref(`userChats/${otherUid}/${roomId}`).update({ username: myUsername, lastMessage: "Чат создан", unreadCount: 0 });
        openChat(roomId, otherDisplayName, null); document.getElementById('searchInput').value = ''; 
        const sR = document.getElementById('searchResults'); if(sR) sR.style.display = 'none';
    });
}

function loadMyChatsList() {
    const myId = localStorage.getItem('myUserId');
    const chatList = document.getElementById('chatList');
    if(!chatList) return;
    
    database.ref(`userChats/${myId}`).on('value', (snapshot) => {
        chatList.innerHTML = ''; 
        const globalDiv = document.createElement('div');
        globalDiv.className = currentRoomId === 'global' ? 'chat-item active' : 'chat-item';
        globalDiv.innerHTML = `<div class="avatar-placeholder" style="background:#4fc3f7;">#</div><div class="chat-info"><div class="chat-name">💬 Общий чат</div><div class="chat-last-msg">Главный канал</div></div>`;
        globalDiv.onclick = function() { openChat('global', 'Общий чат', this); }; chatList.appendChild(globalDiv);

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const roomId = child.key; const data = child.val(); if(!data) return;
                if (data.unreadCount > 0 && currentRoomId !== roomId) {
                    if (previousUnread[roomId] !== data.unreadCount) {
                        const audio = document.getElementById('notifySound');
                        if(audio) { audio.volume = 0.5; audio.play().catch(e => console.log("Звук заблокирован")); }
                    }
                }
                previousUnread[roomId] = data.unreadCount;

                const div = document.createElement('div'); 
                div.className = currentRoomId === roomId ? 'chat-item active' : 'chat-item';
                let badgeHTML = '';
                if (data.unreadCount > 0 && currentRoomId !== roomId) { badgeHTML = `<div class="unread-badge">${data.unreadCount}</div>`; }
                let previewText = data.lastMessage || ""; if (previewText.length > 20) previewText = previewText.substring(0, 20) + '...';
                
                const isChannel = roomId.startsWith('ch_'); 
                const icon = isChannel ? '📢 ' : ''; 

                let avStyle = data.avatarUrl ? `background-image:url(${data.avatarUrl}); color:transparent;` : `background-color:${isChannel ? '#e67e22' : '#4fc3f7'};`;
                let avText = data.avatarUrl ? '' : (isChannel ? '#' : (data.username ? data.username[0].toUpperCase() : '?'));
                
                div.innerHTML = `
                    <div class="avatar-placeholder" style="${avStyle}">${avText}</div>
                    <div class="chat-info">
                        <div class="chat-top"><div class="chat-name">${icon}${data.username || 'Без имени'}</div>${badgeHTML}</div>
                        <div class="chat-last-msg">${previewText}</div>
                    </div>`;
                div.onclick = function() { openChat(roomId, data.username, this); }; chatList.appendChild(div);
            });
        }
    });
}

function openChat(roomId, title, element) {
    currentRoomId = roomId; cancelReply(); closeContextMenu();
    const chatList = document.getElementById('chatList');
    if(chatList) { for(let i=0; i<chatList.children.length; i++){ chatList.children[i].classList.remove('active'); } }
    if(element) element.classList.add('active'); else loadMyChatsList(); 
    if (roomId !== 'global') { database.ref(`userChats/${localStorage.getItem('myUserId')}/${roomId}`).update({ unreadCount: 0 }); }
    loadChat(roomId, title);
    const cArea = document.getElementById('chatArea'); if(cArea) cArea.classList.add('active');
    const bNav = document.getElementById('bottomNav'); if(bNav) bNav.style.display = 'none'; 
}

function closeChat() {
    const cArea = document.getElementById('chatArea'); if(cArea) cArea.classList.remove('active');
    if (currentRoomRef) { currentRoomRef.off(); }
    if (currentTypingRef) { currentTypingRef.off(); }
    if (currentStatusRef) { currentStatusRef.off(); } 
    currentRoomId = 'global'; loadMyChatsList(); 
    const bNav = document.getElementById('bottomNav'); if(bNav) bNav.style.display = 'flex';
}

function loadChat(roomId, title) {
    const titleEl = document.getElementById('chatTitle'); if(titleEl) titleEl.textContent = title || 'Чат';
    const messagesContainer = document.getElementById('messages'); if(messagesContainer) messagesContainer.innerHTML = ''; 
    messagesCache = {}; 
    if (currentRoomRef) { currentRoomRef.off(); }
    if (currentTypingRef) { currentTypingRef.off(); }
    if (currentStatusRef) { currentStatusRef.off(); }
    const inputArea = document.getElementById('messageInputArea');
    const myId = localStorage.getItem('myUserId');
    let typingState = { name: "", isTyping: false };
    let onlineState = false;

    function updateTitle() {
        const tEl = document.getElementById('chatTitle'); if(!tEl) return;
        if (typingState.isTyping) tEl.textContent = `${typingState.name} печатает...`;
        else if (onlineState && roomId !== 'global' && !roomId.startsWith('ch_')) tEl.innerHTML = `${title || 'Чат'} <span class="online-dot"></span>`;
        else tEl.textContent = title || 'Чат';
    }

    currentTypingRef = database.ref('typing/' + roomId);
    currentTypingRef.on('value', (snap) => {
        const typingData = snap.val(); typingState.isTyping = false;
        if (typingData) { for (const uid in typingData) { if (uid !== myId && typingData[uid].isTyping) { typingState.isTyping = true; typingState.name = typingData[uid].name; } } }
        updateTitle();
    });

    if (roomId !== 'global' && !roomId.startsWith('ch_')) {
        const otherUid = roomId.split('_').find(id => id !== myId);
        if(otherUid) {
            currentStatusRef = database.ref('status/' + otherUid);
            currentStatusRef.on('value', (sSnap) => { const status = sSnap.val(); onlineState = (status && status.state === 'online'); updateTitle(); });
        }
    }

    if (roomId.startsWith('ch_')) {
        database.ref('channels/' + roomId).once('value').then((snap) => {
            const chData = snap.val();
            if (chData && chData.owner !== myId) { if(inputArea) inputArea.style.display = 'none'; } else { if(inputArea) inputArea.style.display = 'flex'; }
        });
    } else { if(inputArea) inputArea.style.display = 'flex'; }

    let viewedStr = localStorage.getItem(`viewed_${myId}_${roomId}`);
    let viewedMessages = []; try { if(viewedStr) viewedMessages = JSON.parse(viewedStr); } catch(e) { console.error(e); }

    currentRoomRef = database.ref('chats/' + roomId);
    currentRoomRef.on('child_added', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
        renderMessage(msgId, msg, roomId, myId, messagesContainer, viewedMessages);
        if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (msg.userId !== myId && roomId !== 'global') { database.ref(`userChats/${myId}/${roomId}`).update({ unreadCount: 0 }); }
    });

    currentRoomRef.on('child_removed', function(snapshot) { const el = document.getElementById('msg_wrap_' + snapshot.key); if (el) el.remove(); });

    currentRoomRef.on('child_changed', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
        const reactionsDiv = document.getElementById('reactions_' + msgId); if (reactionsDiv) { reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {}); }
        const viewsSpan = document.getElementById('views_' + msgId); if(viewsSpan) viewsSpan.textContent = msg.views || 0;
        const textDiv = document.getElementById('text_' + msgId);
        if(textDiv && msg.edited) textDiv.innerHTML = `${msg.text} <span style="font-size:10px; color:#aaa;">(изм.)</span> <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
    });
}

function renderMessage(msgId, msg, roomId, myId, container, viewedMessages) {
    if(!container) return;
    const wrapper = document.createElement('div'); wrapper.className = 'message-wrapper ' + ((msg.userId === myId) ? 'sent' : 'received'); wrapper.id = 'msg_wrap_' + msgId;
    const newMessage = document.createElement('div'); newMessage.className = 'message ' + ((msg.userId === myId) ? 'sent' : 'received');
    
    // Вот здесь мы привязываем клик к тексту
    newMessage.onclick = function(e) { showMessageActions(e, msgId, msg.userId === myId); };
    
    let replyHTML = '';
    if (msg.replyTo) replyHTML = `<div class="msg-reply-block"><span class="msg-reply-name">${msg.replyTo.name}</span><span class="msg-reply-text">${msg.replyTo.text}</span></div>`;
    const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    if (msg.userId !== myId && msg.username) {
        database.ref('users/' + msg.userId).once('value').then((uSnap) => {
            const uData = uSnap.val(); let avStyle = uData && uData.avatarUrl ? `background-image:url(${uData.avatarUrl}); color:transparent;` : ``;
            let avText = uData && uData.avatarUrl ? '' : (msg.username ? msg.username[0].toUpperCase() : '?');
            const senderInfo = document.createElement('div'); senderInfo.className = 'sender-info';
            senderInfo.innerHTML = `<div class="sender-avatar" style="${avStyle}">${avText}</div><span class="sender-name">${msg.username}</span>`;
            wrapper.insertBefore(senderInfo, newMessage);
        });
    }
    const editedMark = msg.edited ? `<span style="font-size:10px; color:#aaa;">(изм.)</span>` : '';
    newMessage.innerHTML = replyHTML + `<div id="text_${msgId}">${msg.text} ${editedMark} <span class="msg-time">${timeString}</span></div>`;
    wrapper.appendChild(newMessage);
    if (roomId.startsWith('ch_') && msg.userId !== myId && !viewedMessages.includes(msgId)) {
        viewedMessages.push(msgId); localStorage.setItem(`viewed_${myId}_${roomId}`, JSON.stringify(viewedMessages));
        database.ref(`chats/${roomId}/${msgId}/views`).transaction((v) => (v || 0) + 1);
    }
    let viewsHTML = ''; if (roomId.startsWith('ch_')) viewsHTML = `<div class="views-count">👁️ <span id="views_${msgId}">${msg.views || 0}</span></div>`;
    const reactionsDiv = document.createElement('div'); reactionsDiv.id = 'reactions_' + msgId; reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {});
    wrapper.appendChild(reactionsDiv); if (viewsHTML) wrapper.insertAdjacentHTML('beforeend', viewsHTML); container.appendChild(wrapper);
}

function getReactionsHTML(reactions) {
    let html = '';
    for (const [emoji, users] of Object.entries(reactions)) { if (users.length > 0) html += `<span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; font-size: 12px; margin-right: 5px; margin-top: 5px; display: inline-block;">${emoji} ${users.length}</span>`; }
    return html;
}

function sendMessage() {
    const input = document.getElementById('msgInput'); if(!input) return;
    const text = input.value; const myId = localStorage.getItem('myUserId');
    if (text.length > 500) return alert("Сообщение слишком длинное! Максимум 500 символов.");
    if (text.trim() !== "" && myId) {
        database.ref('users/' + myId).once('value').then((snap) => {
            const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const myAvatar = myData ? myData.avatarUrl : null;
            const msgData = { text: text, userId: myId, username: myName, timestamp: Date.now(), views: 0 };
            if (activeReplyContext) msgData.replyTo = activeReplyContext;
            database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                input.value = ""; cancelReply(); input.focus(); database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false }); clearTimeout(typingTimeout);
                if (currentRoomId !== 'global') {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: text });
                    if (!currentRoomId.startsWith('ch_')) {
                        const otherUid = currentRoomId.split('_').find(id => id !== myId);
                        if(otherUid) database.ref(`userChats/${otherUid}/${currentRoomId}`).once('value').then((s) => {
                            const currentUnread = s.val() && s.val().unreadCount ? s.val().unreadCount : 1;
                            database.ref(`userChats/${otherUid}/${currentRoomId}`).update({ lastMessage: text, unreadCount: currentUnread + 1, username: myName, avatarUrl: myAvatar });
                        });
                    }
                }
            });
        });
    }
}

document.getElementById('msgInput').addEventListener('keypress', function (e) { if (e.key === 'Enter') sendMessage(); });
const tg = window.Telegram.WebApp; if(tg) { tg.expand(); }
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && !localStorage.getItem('myUserId')) {
    const tgUser = tg.initDataUnsafe.user; const tgEmail = `tg_${tgUser.id}@wizchat.com`; const tgPassword = `telegram_secret_${tgUser.id}`;
    auth.signInWithEmailAndPassword(tgEmail, tgPassword).catch((error) => {
        if (error.code === 'auth/user-not-found') auth.createUserWithEmailAndPassword(tgEmail, tgPassword).then((user) => {
            database.ref('users/' + user.user.uid).set({ username: tgUser.username || 'tg_user_' + tgUser.id, displayName: tgUser.first_name || 'Гость', avatar: tgUser.first_name ? tgUser.first_name[0].toUpperCase() : 'T' });
            database.ref('usernames/' + (tgUser.username || 'tg_' + tgUser.id)).set({ type: 'user', id: user.user.uid });
        });
    });
}
// КОНЕЦ КОДА