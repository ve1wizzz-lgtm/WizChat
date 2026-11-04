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
let currentProfileChannelId = null; 
let activeReplyContext = null;
let messagesCache = {}; 

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

function openCreateModal() { document.getElementById('createModal').style.display = 'flex'; }
function closeCreateModal() { document.getElementById('createModal').style.display = 'none'; }
function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }function openProfileModal() {
    if (currentRoomId === 'global') return;
    const modal = document.getElementById('profileModal');
    const av = document.getElementById('profAvatar');
    const name = document.getElementById('profName');
    const uname = document.getElementById('profUsername');
    const subs = document.getElementById('profSubs');
    const leaveBtn = document.getElementById('leaveChannelBtn');

    name.textContent = "Загрузка..."; modal.style.display = 'flex'; leaveBtn.style.display = 'none';

    if (currentRoomId.startsWith('ch_')) {
        currentProfileChannelId = currentRoomId;
        database.ref('channels/' + currentRoomId).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.name; uname.textContent = '@' + data.username;
                av.textContent = '#'; av.style.background = '#e67e22';
                subs.textContent = (data.subscribers || 1) + " подписчиков";
                leaveBtn.style.display = 'block';
            }
        });
    } else {
        const otherUid = currentRoomId.split('_').find(id => id !== localStorage.getItem('myUserId'));
        database.ref('users/' + otherUid).once('value').then((snap) => {
            const data = snap.val();
            if(data) {
                name.textContent = data.displayName || data.username; uname.textContent = '@' + data.username;
                av.textContent = data.avatar || data.username[0].toUpperCase(); av.style.background = '#4fc3f7';
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
applySettings();function registerUser() {
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
        document.getElementById('authScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'flex';
        localStorage.setItem('myUserId', user.uid); loadChat('global', 'Общий чат'); loadMyChatsList(); loadProfile(); 
    } else {
        document.getElementById('authScreen').style.display = 'flex'; document.getElementById('mainApp').style.display = 'none';
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
            document.getElementById('profileAvatar').textContent = data.avatar || data.username[0].toUpperCase();
            document.getElementById('newDisplayName').value = data.displayName || data.username;
            document.getElementById('newAvatarText').value = data.avatar || data.username[0].toUpperCase();
        }
    });
}

function saveProfile() {
    const myId = localStorage.getItem('myUserId');
    const newName = document.getElementById('newDisplayName').value.trim();
    const newAvatar = document.getElementById('newAvatarText').value.trim();
    if(!newName || !newAvatar) return alert("Заполни все поля!");
    database.ref('users/' + myId).update({ displayName: newName, avatar: newAvatar }).then(() => alert("Сохранено!"));
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
                div.innerHTML = `<div class="avatar-placeholder">${user.avatar || user.username[0]}</div><div>👤 @${user.username}</div>`;
                div.onclick = () => startPrivateChat(uid, user.username); resultsDiv.appendChild(div);
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

function startPrivateChat(otherUid, otherUsername) {
    const myId = localStorage.getItem('myUserId');
    const roomId = [myId, otherUid].sort().join('_'); 
    database.ref('users/' + myId).once('value').then((snap) => {
        const myUsername = snap.val().username;
        database.ref(`userChats/${myId}/${roomId}`).update({ username: otherUsername, lastMessage: "Чат создан", unreadCount: 0 });
        database.ref(`userChats/${otherUid}/${roomId}`).update({ username: myUsername, lastMessage: "Чат создан", unreadCount: 0 });
        openChat(roomId, otherUsername, null);
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
        globalDiv.innerHTML = `<div class="chat-info"><div class="chat-name">💬 Общий чат</div><div class="chat-last-msg">Главный канал</div></div>`;
        globalDiv.onclick = function() { openChat('global', 'Общий чат', this); }; chatList.appendChild(globalDiv);
        if (snapshot.exists()) {
            snapshot.forEach((child) => {
                const roomId = child.key; const data = child.val();
                const div = document.createElement('div'); div.className = currentRoomId === roomId ? 'chat-item active' : 'chat-item';
                let badgeHTML = '';
                if (data.unreadCount > 0 && currentRoomId !== roomId) { badgeHTML = `<div class="unread-badge">${data.unreadCount}</div>`; }
                let previewText = data.lastMessage || ""; if (previewText.length > 20) previewText = previewText.substring(0, 20) + '...';
                const icon = roomId.startsWith('ch_') ? '📢' : '@';
                div.innerHTML = `<div class="chat-info"><div class="chat-top"><div class="chat-name">${icon} ${data.username}</div>${badgeHTML}</div><div class="chat-last-msg">${previewText}</div></div>`;
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
    currentRoomId = 'global'; loadMyChatsList(); document.getElementById('bottomNav').style.display = 'flex';
}

function loadChat(roomId, title) {
    document.getElementById('chatTitle').textContent = title;
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = ''; 
    messagesCache = {}; 
    if (currentRoomRef) { currentRoomRef.off(); }
    
    const inputArea = document.getElementById('messageInputArea');
    const myId = localStorage.getItem('myUserId');

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
        renderMessage(msgId, msg, roomId, myId, messagesContainer);
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

    function renderMessage(msgId, msg, roomId, myId, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ' + ((msg.userId === myId) ? 'sent' : 'received');
        wrapper.id = 'msg_wrap_' + msgId;
        
        const newMessage = document.createElement('div');
        newMessage.className = 'message ' + ((msg.userId === myId) ? 'sent' : 'received');
        
        let replyHTML = '';
        if (msg.replyTo) {
            replyHTML = `<div class="msg-reply-block"><span class="msg-reply-name">${msg.replyTo.name}</span><span class="msg-reply-text">${msg.replyTo.text}</span></div>`;
        }
        let senderHTML = (msg.userId !== myId && msg.username) ? `<span class="sender-name">${msg.username}</span>` : '';
        
        newMessage.innerHTML = replyHTML + senderHTML + `<div>${msg.text}</div>`;
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

function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value;
    const myId = localStorage.getItem('myUserId');

    if (text.trim() !== "" && myId) {
        database.ref('users/' + myId).once('value').then((snap) => {
            const myData = snap.val();
            const myName = myData ? myData.displayName || myData.username : "Аноним";
            
            const msgData = { text: text, userId: myId, username: myName, timestamp: Date.now(), views: 0 };
            if (activeReplyContext) { msgData.replyTo = activeReplyContext; }

            database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                input.value = ""; cancelReply(); input.focus();
                
                if (currentRoomId !== 'global') {
                    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: text });
                    if (!currentRoomId.startsWith('ch_')) {
                        const otherUid = currentRoomId.split('_').find(id => id !== myId);
                        database.ref(`userChats/${otherUid}/${currentRoomId}`).once('value').then((s) => {
                            const currentUnread = s.val() && s.val().unreadCount ? s.val().unreadCount : 1;
                            database.ref(`userChats/${otherUid}/${currentRoomId}`).update({ lastMessage: text, unreadCount: currentUnread + 1 });
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
// КОНЕЦ КОДА

function leaveChannel() {
    const myId = localStorage.getItem('myUserId');
    if(!currentProfileChannelId) return;
    if(!confirm("Вы уверены, что хотите отписаться?")) return;
    database.ref(`userChats/${myId}/${currentProfileChannelId}`).remove().then(() => {
        database.ref('channels/' + currentProfileChannelId + '/subscribers').transaction((subs) => (subs || 1) - 1);
        closeProfileModal(); closeChat(); loadMyChatsList(); alert("Вы отписались.");
    });
}