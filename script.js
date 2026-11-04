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
let currentProfileChannelId = null; 
let activeReplyContext = null;
let messagesCache = {}; 
let typingTimeout;
let tempAvatarBase64 = null;
let previousUnread = {}; 

// --- СИСТЕМА ОНЛАЙН-СТАТУСА ---
const userStatusDatabaseRef = database.ref('/status');

function setupOnlineStatus(uid) {
    const isOfflineForDatabase = { state: 'offline', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const isOnlineForDatabase = { state: 'online', last_changed: firebase.database.ServerValue.TIMESTAMP };
    const userRef = database.ref('/status/' + uid);

    database.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() == false) return;
        userRef.onDisconnect().set(isOfflineForDatabase).then(() => {
            userRef.set(isOnlineForDatabase);
        });
    });
}

// Загрузка фото с телефона
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

function setReply(msgId) {
    const msg = messagesCache[msgId];
    if(!msg) return;
    activeReplyContext = { name: msg.username || 'Аноним', text: msg.text };
    document.getElementById('replyPreview').style.display = 'flex';
    document.getElementById('replyPreviewName').textContent = activeReplyContext.name;
    document.getElementById('replyPreviewText').textContent = activeReplyContext.text;
    document.getElementById('msgInput').focus();
}

function cancelReply() {
    activeReplyContext = null;
    document.getElementById('replyPreview').style.display = 'none';
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

function deleteMessage(roomId, msgId) {
    if(confirm("Удалить сообщение для всех?")) {
        database.ref(`chats/${roomId}/${msgId}`).remove();
    }
}

// --- УДАЛЕНИЕ ЧАТА ИЗ СПИСКА ---
function deleteChat(roomId) {
    if(confirm("Удалить этот чат из списка?")) {
        const myId = localStorage.getItem('myUserId');
        database.ref(`userChats/${myId}/${roomId}`).remove().then(() => {
            if(currentRoomId === roomId) closeChat();
            loadMyChatsList();
        });
    }
}

function openCreateModal() { document.getElementById('createModal').style.display = 'flex'; }
function closeCreateModal() { document.getElementById('createModal').style.display = 'none'; }
function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }function leaveChannel() {
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

    name.textContent = "Загрузка..."; modal.style.display = 'flex'; leaveBtn.style.display = 'none';
    av.style.backgroundImage = 'none';

    if (currentRoomId.startsWith('ch_')) {
        currentProfileChannelId = currentRoomId;
        database.ref('channels/' + currentRoomId).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.name; uname.textContent = '@' + data.username;
                av.textContent = '#'; av.style.background = '#e67e22'; av.style.backgroundColor = '#e67e22';
                subs.textContent = (data.subscribers || 1) + " подписчиков";
                leaveBtn.style.display = 'block';
            }
        });
    } else {
        const otherUid = currentRoomId.split('_').find(id => id !== localStorage.getItem('myUserId'));
        database.ref('users/' + otherUid).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.displayName || data.username; 
                uname.textContent = '@' + data.username;
                if(data.avatarUrl) {
                    av.textContent = ''; av.style.backgroundImage = `url(${data.avatarUrl})`; av.style.backgroundColor = 'transparent';
                } else {
                    av.textContent = data.avatar || data.username[0].toUpperCase(); av.style.backgroundColor = '#4fc3f7';
                }
                subs.textContent = "Пользователь";
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
    document.getElementById('tab-' + tabId).classList.add('active'); element.classList.add('active');
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
        
        setupOnlineStatus(user.uid); // Включаем онлайн-статус
        
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
                profAvatar.textContent = '';
                profAvatar.style.backgroundImage = `url(${data.avatarUrl})`;
                profAvatar.style.backgroundColor = 'transparent';
            } else {
                profAvatar.style.backgroundImage = 'none';
                profAvatar.textContent = data.avatar || data.username[0].toUpperCase();
                profAvatar.style.backgroundColor = '#4fc3f7';
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
        database.ref(`userChats/${myId}`).once('value').then(snap => {
             snap.forEach(child => {
                const roomId = child.key;
                if(!roomId.startsWith('ch_')) {
                    const otherUid = roomId.split('_').find(id => id !== myId);
                    database.ref(`users/${otherUid}`).once('value').then(uSnap => {
                        const uData = uSnap.val();
                        if(uData) { database.ref(`userChats/${myId}/${roomId}`).update({ username: uData.displayName || uData.username, avatarUrl: uData.avatarUrl || '' }); }
                    });
                }
            });
        });
        alert("Профиль обновлен!");
        tempAvatarBase64 = null; 
    });
}

function liveSearch() {
    const searchName = document.getElementById('searchInput').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    const myId = localStorage.getItem('myUserId');
    if (!searchName) { resultsDiv.style.display = 'none'; return; }
    resultsDiv.style.display = 'block'; resultsDiv.innerHTML = '<div style="padding:10px; color:gray;">Поиск...</div>';
    database.ref('users').once('value', (userSnap) => {
        resultsDiv.innerHTML = ''; let found = false;
        userSnap.forEach((child) => {
            const user = child.val(); const uid = child.key;
            if (user.username.includes(searchName) && uid !== myId) {
                found = true; const div = document.createElement('div'); div.className = 'search-user-item';
                let avStyle = user.avatarUrl ? `background-image:url(${user.avatarUrl}); color:transparent;` : `background-color:#4fc3f7;`;
                let avText = user.avatarUrl ? '' : (user.avatar || user.username[0]);
                div.innerHTML = `<div class="avatar-placeholder" style="${avStyle}">${avText}</div><div>👤 @${user.username} <span style="color:gray; font-size:12px;">(${user.displayName || user.username})</span></div>`;
                div.onclick = () => startPrivateChat(uid, user.displayName || user.username); resultsDiv.appendChild(div);
            }
        });
        database.ref('channels').orderByChild('isPrivate').equalTo(false).once('value', (chSnap) => {
            chSnap.forEach((child) => {
                const ch = child.val(); const chId = child.key;
                if (ch.username.includes(searchName)) {
                    found = true; const div = document.createElement('div'); div.className = 'search-user-item';
                    div.innerHTML = `<div class="avatar-placeholder" style="background: #e67e22;">#</div><div>📢 ${ch.name} (@${ch.username})</div>`;
                    div.onclick = () => joinPublicChannel(chId, ch.name); resultsDiv.appendChild(div);
                }
            });
            if (!found) resultsDiv.innerHTML = '<div style="padding:10px; color:gray;">Никого не найдено</div>';
        });
    });
}

function joinPublicChannel(channelId, name) {
    const myId = localStorage.getItem('myUserId');
    database.ref(`userChats/${myId}/${channelId}`).set({ username: name, lastMessage: "Вы подписались", unreadCount: 0 }).then(() => {
        database.ref('channels/' + channelId + '/subscribers').transaction((subs) => (subs || 0) + 1);
        document.getElementById('searchInput').value = ''; document.getElementById('searchResults').style.display = 'none';
        loadMyChatsList(); openChat(channelId, name, null);
    });
}

function startPrivateChat(otherUid, otherDisplayName) {
    const myId = localStorage.getItem('myUserId');
    const roomId = [myId, otherUid].sort().join('_'); 
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val();
        const myUsername = myData.displayName || myData.username;
        database.ref(`userChats/${myId}/${roomId}`).update({ username: otherDisplayName, lastMessage: "Чат создан", unreadCount: 0 });
        database.ref(`userChats/${otherUid}/${roomId}`).update({ username: myUsername, lastMessage: "Чат создан", unreadCount: 0 });
        openChat(roomId, otherDisplayName, null);
        document.getElementById('searchInput').value = ''; document.getElementById('searchResults').style.display = 'none';
    });
}

function loadMyChatsList() {
    const myId = localStorage.getItem('myUserId');
    const chatList = document.getElementById('chatList');
    
    database.ref(`userChats/${myId}`).on('value', (snapshot) => {
        chatList.innerHTML = ''; 
        const globalDiv = document.createElement('div');
        globalDiv.className = currentRoomId === 'global' ? 'chat-item active' : 'chat-item';
        globalDiv.innerHTML = `<div class="avatar-placeholder" style="background:#4fc3f7;">#</div><div class="chat-info"><div class="chat-name">💬 Общий чат</div><div class="chat-last-msg">Главный канал</div></div>`;
        globalDiv.onclick = function() { openChat('global', 'Общий чат', this); }; chatList.appendChild(globalDiv);

        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const roomId = child.key; const data = child.val();
                
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
                
                const icon = roomId.startsWith('ch_') ? '📢' : '@';
                const isChannel = roomId.startsWith('ch_');
                let avStyle = data.avatarUrl ? `background-image:url(${data.avatarUrl}); color:transparent;` : `background-color:${isChannel ? '#e67e22' : '#4fc3f7'};`;
                let avText = data.avatarUrl ? '' : (isChannel ? '#' : data.username[0].toUpperCase());
                
                // Кнопка удаления чата (кроме каналов и общего чата)
                let deleteBtnHTML = (!isChannel) ? `<button class="delete-chat-btn" onclick="event.stopPropagation(); deleteChat('${roomId}')">🗑️</button>` : '';

                div.innerHTML = `
                    <div class="avatar-placeholder" style="${avStyle}">${avText}</div>
                    <div class="chat-info">
                        <div class="chat-top">
                            <div class="chat-name">${icon} ${data.username}</div>
                            ${badgeHTML}
                        </div>
                        <div class="chat-last-msg">${previewText}</div>
                    </div>
                    ${deleteBtnHTML}
                `;
                div.onclick = function() { openChat(roomId, data.username, this); }; chatList.appendChild(div);
            });
        }
    });
}

function openChat(roomId, title, element) {
    currentRoomId = roomId;
    cancelReply();
    const chatList = document.getElementById('chatList');
    for(let i=0; i<chatList.children.length; i++){ chatList.children[i].classList.remove('active'); }
    if(element) element.classList.add('active'); else loadMyChatsList(); 
    if (roomId !== 'global') { database.ref(`userChats/${localStorage.getItem('myUserId')}/${roomId}`).update({ unreadCount: 0 }); }
    loadChat(roomId, title);
    document.getElementById('chatArea').classList.add('active');
    document.getElementById('bottomNav').style.display = 'none'; 
}

function closeChat() {
    document.getElementById('chatArea').classList.remove('active');
    if (currentRoomRef) { currentRoomRef.off(); }
    if (currentTypingRef) { currentTypingRef.off(); }
    currentRoomId = 'global'; 
    loadMyChatsList(); 
    document.getElementById('bottomNav').style.display = 'flex';
}

function loadChat(roomId, title) {
    document.getElementById('chatTitle').textContent = title;
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = ''; 
    messagesCache = {}; 
    
    if (currentRoomRef) { currentRoomRef.off(); }
    if (currentTypingRef) { currentTypingRef.off(); }
    
    const inputArea = document.getElementById('messageInputArea');
    const myId = localStorage.getItem('myUserId');
    
    let typingState = { name: "", isTyping: false };
    let onlineState = false;

    // ФУНКЦИЯ ОБНОВЛЕНИЯ ЗАГОЛОВКА ЧАТА (Онлайн + Печатает)
    function updateTitle() {
        const titleEl = document.getElementById('chatTitle');
        if (typingState.isTyping) {
            titleEl.textContent = `${typingState.name} печатает...`;
        } else if (onlineState && roomId !== 'global' && !roomId.startsWith('ch_')) {
            titleEl.innerHTML = `${title} <span class="online-dot"></span>`;
        } else {
            titleEl.textContent = title;
        }
    }

    // Слушаем печатает
    currentTypingRef = database.ref('typing/' + roomId);
    currentTypingRef.on('value', (snap) => {
        const typingData = snap.val();
        typingState.isTyping = false;
        if (typingData) {
            for (const uid in typingData) {
                if (uid !== myId && typingData[uid].isTyping) {
                    typingState.isTyping = true;
                    typingState.name = typingData[uid].name; 
                }
            }
        }
        updateTitle();
    });

    // Слушаем онлайн собеседника
    if (roomId !== 'global' && !roomId.startsWith('ch_')) {
        const otherUid = roomId.split('_').find(id => id !== myId);
        database.ref('status/' + otherUid).on('value', (sSnap) => {
            const status = sSnap.val();
            onlineState = (status && status.state === 'online');
            updateTitle();
        });
    }

    if (roomId.startsWith('ch_')) {
        database.ref('channels/' + roomId).once('value').then((snap) => {
            const chData = snap.val();
            if (chData && chData.owner !== myId) { inputArea.style.display = 'none'; } else { inputArea.style.display = 'flex'; }
        });
    } else { inputArea.style.display = 'flex'; }

    let viewedStr = localStorage.getItem(`viewed_${myId}_${roomId}`);
    let viewedMessages = viewedStr ? JSON.parse(viewedStr) : [];

    currentRoomRef = database.ref('chats/' + roomId);
    
    currentRoomRef.on('child_added', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key;
        messagesCache[msgId] = msg; 
        renderMessage(msgId, msg, roomId, myId, messagesContainer, viewedMessages);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (msg.userId !== myId && roomId !== 'global') { database.ref(`userChats/${myId}/${roomId}`).update({ unreadCount: 0 }); }
    });

    currentRoomRef.on('child_removed', function(snapshot) {
        const el = document.getElementById('msg_wrap_' + snapshot.key);
        if (el) el.remove();
    });

    currentRoomRef.on('child_changed', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key;
        messagesCache[msgId] = msg; 
        const reactionsDiv = document.getElementById('reactions_' + msgId);
        if (reactionsDiv) { reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {}); }
        const viewsSpan = document.getElementById('views_' + msgId);
        if(viewsSpan) viewsSpan.textContent = msg.views || 0;
    });
}

function renderMessage(msgId, msg, roomId, myId, container, viewedMessages) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + ((msg.userId === myId) ? 'sent' : 'received');
    wrapper.id = 'msg_wrap_' + msgId;
    
    const newMessage = document.createElement('div');
    newMessage.className = 'message ' + ((msg.userId === myId) ? 'sent' : 'received');
    
    let replyHTML = '';
    if (msg.replyTo) {
        replyHTML = `<div class="msg-reply-block"><span class="msg-reply-name">${msg.replyTo.name}</span><span class="msg-reply-text">${msg.replyTo.text}</span></div>`;
    }
    
    // Время отправки
    const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let senderHTML = '';
    if (msg.userId !== myId && msg.username) {
        database.ref('users/' + msg.userId).once('value').then((uSnap) => {
            const uData = uSnap.val();
            let avStyle = uData && uData.avatarUrl ? `background-image:url(${uData.avatarUrl}); color:transparent;` : ``;
            let avText = uData && uData.avatarUrl ? '' : (msg.username[0].toUpperCase());
            let avBlock = `<div class="sender-avatar" style="${avStyle}">${avText}</div>`;
            const senderInfo = document.createElement('div');
            senderInfo.className = 'sender-info';
            senderInfo.innerHTML = `${avBlock}<span class="sender-name">${msg.username}</span>`;
            wrapper.insertBefore(senderInfo, newMessage);
        });
    }
    
    newMessage.innerHTML = replyHTML + `<div>${msg.text} <span class="msg-time">${timeString}</span></div>`;
    wrapper.appendChild(newMessage);

    if (roomId.startsWith('ch_') && msg.userId !== myId && !viewedMessages.includes(msgId)) {
        viewedMessages.push(msgId);
        localStorage.setItem(`viewed_${myId}_${roomId}`, JSON.stringify(viewedMessages));
        database.ref(`chats/${roomId}/${msgId}/views`).transaction((v) => (v || 0) + 1);
    }

    let viewsHTML = '';
    if (roomId.startsWith('ch_')) {
        viewsHTML = `<div class="views-count">👁️ <span id="views_${msgId}">${msg.views || 0}</span></div>`;
    }
    
    const reactionsDiv = document.createElement('div');
    reactionsDiv.id = 'reactions_' + msgId;
    reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {});
    
    let actionBtn = `<button class="msg-btn" onclick="setReply('${msgId}')">↩️</button>`;
    let reactBtns = `<button class="msg-btn" onclick="toggleReaction('${roomId}', '${msgId}', '👍')">👍</button>
                     <button class="msg-btn" onclick="toggleReaction('${roomId}', '${msgId}', '🔥')">🔥</button>`;
    let deleteBtn = (msg.userId === myId) ? `<button class="msg-btn" onclick="deleteMessage('${roomId}', '${msgId}')">🗑️</button>` : '';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'msg-actions';
    actionsDiv.innerHTML = `${actionBtn} ${reactBtns} ${deleteBtn}`;

    wrapper.appendChild(reactionsDiv);
    wrapper.appendChild(actionsDiv);
    if (viewsHTML) { wrapper.insertAdjacentHTML('beforeend', viewsHTML); }

    container.appendChild(wrapper);
}

function getReactionsHTML(reactions) {
    let html = '';
    for (const [emoji, users] of Object.entries(reactions)) {
        if (users.length > 0) {
            html += `<span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; font-size: 12px; margin-right: 5px;">${emoji} ${users.length}</span>`;
        }
    }
    return html;
}

// --- ОТПРАВКА СООБЩЕНИЯ С ОГРАНИЧЕНИЕМ ДЛИНЫ ---
function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value;
    const myId = localStorage.getItem('myUserId');

    if (text.length > 500) {
        return alert("Сообщение слишком длинное! Максимум 500 символов.");
    }

    if (text.trim() !== "" && myId) {
        database.ref('users/' + myId).once('value').then((snap) => {
            const myData = snap.val();
            const myName = myData ? myData.displayName || myData.username : "Аноним";
            const myAvatar = myData ? myData.avatarUrl : null;
            
            const msgData = { text: text, userId: myId, username: myName, timestamp: Date.now(), views: 0 };
            if (activeReplyContext) { msgData.replyTo = activeReplyContext; }

            database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                input.value = ""; cancelReply(); input.focus();
                database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false });
                clearTimeout(typingTimeout);
                
                if (currentRoomId !== 'global') {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: text });
                    if (!currentRoomId.startsWith('ch_')) {
                        const otherUid = currentRoomId.split('_').find(id => id !== myId);
                        database.ref(`userChats/${otherUid}/${currentRoomId}`).once('value').then((s) => {
                            const currentUnread = s.val() && s.val().unreadCount ? s.val().unreadCount : 1;
                            database.ref(`userChats/${otherUid}/${currentRoomId}`).update({ lastMessage: text, unreadCount: currentUnread + 1, username: myName, avatarUrl: myAvatar });
                        });
                    }
                }
            });
        });
    }
}

document.getElementById('msgInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') sendMessage();
});

const tg = window.Telegram.WebApp;
if(tg) { tg.expand(); }

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && !localStorage.getItem('myUserId')) {
    const tgUser = tg.initDataUnsafe.user;
    const tgEmail = `tg_${tgUser.id}@wizchat.com`;
    const tgPassword = `telegram_secret_${tgUser.id}`;

    auth.signInWithEmailAndPassword(tgEmail, tgPassword)
        .catch((error) => {
            if (error.code === 'auth/user-not-found') {
                auth.createUserWithEmailAndPassword(tgEmail, tgPassword)
                    .then((user) => {
                        database.ref('users/' + user.user.uid).set({ username: tgUser.username || 'tg_user_' + tgUser.id, displayName: tgUser.first_name || 'Гость', avatar: tgUser.first_name ? tgUser.first_name[0].toUpperCase() : 'T' });
                        database.ref('usernames/' + (tgUser.username || 'tg_' + tgUser.id)).set({ type: 'user', id: user.user.uid });
                    });
            }
        });
}
// КОНЕЦ КОДА