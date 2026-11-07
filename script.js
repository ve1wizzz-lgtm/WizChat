const firebaseConfig = { apiKey: "AIzaSyD99mv9x7tSAItOJ4UooTyPhNlewRGQnh0", authDomain: "wizchat-3e52f.firebaseapp.com", projectId: "wizchat-3e52f", storageBucket: "wizchat-3e52f.firebasestorage.app", messagingSenderId: "125275309502", appId: "1:125275309502:web:b30f41e2686976a46765ef", databaseURL: "https://wizchat-3e52f-default-rtdb.firebaseio.com" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database(); const auth = firebase.auth();
let currentRoomId = 'global', currentRoomRef = null, currentTypingRef = null, currentStatusRef = null, currentBlockRef1 = null, currentBlockRef2 = null, currentProfileChannelId = null, currentProfileUid = null, activeReplyContext = null, messagesCache = {}, typingTimeout, tempAvatarBase64 = null, tempBannerBase64 = null, currentMenuMsgId = null, menuCloseTimeout = null, allUsersCache = [], mediaRecorder, audioChunks = [], isRecording = false, recordingTimeout, createType = 'channel', forwardMsgData = null, hiddenMessages = [];
let isProfileEditMode = false, currentChatMenuRoomId = null, currentProfMenuUid = null;
if ("Notification" in window && Notification.permission !== "granted") { Notification.requestPermission(); }
const IMGBB_API_KEY = "2cfc53f344ebcdd4a71f0ab2b3bd0439";

function setupOnlineStatus(uid) {
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
function openLightbox(src) { const lb = document.getElementById('imageLightbox'); document.getElementById('lightboxImg').src = src; lb.style.display = 'flex'; setTimeout(() => lb.classList.add('show'), 10); }
function closeLightbox() { const lb = document.getElementById('imageLightbox'); lb.classList.remove('show'); setTimeout(() => lb.style.display = 'none', 300); }
function scrollToBottom() { const msgContainer = document.getElementById('messages'); if(msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight; }
function scrollToMsg(msgId) { const el = document.getElementById('msg_wrap_' + msgId); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight-msg'); setTimeout(() => el.classList.remove('highlight-msg'), 1500); } }function uploadToImgBB(file, type) {
    if (type === 'avatar') { const av = document.getElementById('profileAvatar'); av.style.backgroundImage = 'none'; av.textContent = '⏳'; } 
    else { const b = document.getElementById('myProfileBanner'); b.style.backgroundImage = 'none'; b.style.backgroundColor = '#555'; }
    const formData = new FormData(); formData.append('image', file);
    fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const imageUrl = data.data.url; 
            if (type === 'avatar') { tempAvatarBase64 = imageUrl; const profAvatar = document.getElementById('profileAvatar'); profAvatar.textContent = ''; profAvatar.style.backgroundImage = `url(${imageUrl})`; } 
            else { tempBannerBase64 = imageUrl; const bannerEl = document.getElementById('myProfileBanner'); bannerEl.style.backgroundImage = `url(${imageUrl})`; }
        } else { alert("Ошибка ImgBB: " + data.error.message); }
    }).catch(error => { alert("Ошибка интернета!"); console.error(error); });
}
function handleAvatarUpload(event) { const file = event.target.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) return alert("Максимум 10 МБ."); uploadToImgBB(file, 'avatar'); }
function handleBannerUpload(event) { const file = event.target.files[0]; if (!file) return; if (file.size > 15 * 1024 * 1024) return alert("Максимум 15 МБ."); uploadToImgBB(file, 'banner'); }

function registerUser() {
    const rawUsername = document.getElementById('loginUsername').value; const username = rawUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); const password = document.getElementById('loginPassword').value;
    if (!username || username.length < 3) return alert("Юзернейм минимум 3 символа"); 
    if (!password || password.length < 6) return alert("Пароль минимум 6 символов");
    const email = username + "@wizchat.com";
    auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
        const uid = userCredential.user.uid;
        database.ref('users/' + uid).set({ username: username, displayName: username, bio: "", avatarUrl: null, bannerUrl: null, privateAccount: false, forbidFirstMessage: false }).then(() => {
            database.ref('usernames/' + username).set({ type: 'user', id: uid }).then(() => { alert("Успешно! Теперь войди."); auth.signOut(); });
        }).catch(err => alert("Ошибка БД: " + err.message));
    }).catch(err => alert("Ошибка Auth: " + err.message));
}
function loginUser() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase(); const password = document.getElementById('loginPassword').value;
    if (!username || !password) return alert("Заполни все поля"); const email = username + "@wizchat.com";
    auth.signInWithEmailAndPassword(email, password).then((userCredential) => {
        const uid = userCredential.user.uid; localStorage.setItem('myUserId', uid); document.getElementById('authScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'flex'; setupOnlineStatus(uid); loadMyChatsList(); loadProfile();
    }).catch(err => alert("Неверный логин/пароль"));
}
function logoutUser() { if (!confirm("Выйти?")) return; auth.signOut().then(() => { localStorage.removeItem('myUserId'); document.getElementById('mainApp').style.display = 'none'; document.getElementById('authScreen').style.display = 'flex'; }); }function toggleProfileEditMode() {
    isProfileEditMode = !isProfileEditMode;
    document.getElementById('profileEditFields').style.display = isProfileEditMode ? 'block' : 'none';
    document.getElementById('profileBioView').style.display = isProfileEditMode ? 'none' : 'block';
    document.getElementById('changeAvatarBtn').style.display = isProfileEditMode ? 'block' : 'none';
    document.getElementById('changeBannerBtn').style.display = isProfileEditMode ? 'block' : 'none';
    document.getElementById('toggleEditBtn').textContent = isProfileEditMode ? '❌ Отмена' : '✏️ Изменить';
    if(!isProfileEditMode) loadProfile();
}
function loadProfile() {
    const myId = localStorage.getItem('myUserId'); if (!myId) return;
    database.ref('users/' + myId).once('value').then(snap => {
        const data = snap.val(); if (!data) return; 
        const avatarEl = document.getElementById('profileAvatar'); const bannerEl = document.getElementById('myProfileBanner'); const displayNameEl = document.getElementById('profileDisplayName'); const usernameEl = document.getElementById('profileUsername'); const bioView = document.getElementById('profileBioView'); const navAvatar = document.getElementById('navProfileAvatar');
        if(displayNameEl) displayNameEl.textContent = data.displayName || data.username || "Без имени"; 
        if(usernameEl) usernameEl.textContent = '@' + (data.username || "unknown");
        if(bioView) bioView.textContent = data.bio || "Описание не добавлено...";

        if (data.avatarUrl) { 
            if(avatarEl) { avatarEl.textContent = ''; avatarEl.style.backgroundImage = `url(${data.avatarUrl})`; } 
            if(navAvatar) { navAvatar.textContent = ''; navAvatar.style.backgroundImage = `url(${data.avatarUrl})`; } 
        } else { 
            if(avatarEl) { avatarEl.textContent = data.username ? data.username[0].toUpperCase() : '?'; avatarEl.style.backgroundImage = 'none'; }
            if(navAvatar) { navAvatar.textContent = data.username ? data.username[0].toUpperCase() : '?'; navAvatar.style.backgroundImage = 'none'; } 
        } 
        if (bannerEl) { if (data.bannerUrl) bannerEl.style.backgroundImage = `url(${data.bannerUrl})`; else { bannerEl.style.backgroundImage = 'none'; bannerEl.style.backgroundColor = '#2b5278'; } }
        document.getElementById('newDisplayName').value = data.displayName || ''; document.getElementById('newBio').value = data.bio || '';
    });
}
function saveProfile() {
    const myId = localStorage.getItem('myUserId'); if (!myId) return; 
    const newName = document.getElementById('newDisplayName').value.trim(); const newBio = document.getElementById('newBio').value.trim(); const updates = {}; 
    if (newName) updates.displayName = newName; updates.bio = newBio; 
    if (tempAvatarBase64) updates.avatarUrl = tempAvatarBase64; 
    if (tempBannerBase64) updates.bannerUrl = tempBannerBase64; 
    database.ref('users/' + myId).update(updates).then(() => { tempAvatarBase64 = null; tempBannerBase64 = null; alert("Сохранено!"); toggleProfileEditMode(); });
}function toggleProfOptions() {
    const menu = document.getElementById('profContextMenu');
    if (!menu) return;
    if (menu.classList.contains('show')) { menu.classList.remove('show'); }
    else {
        menu.style.top = '60px'; menu.style.right = '15px';
        menu.classList.add('show');
    }
}
function toggleBlockUser() {
    if (!currentProfileUid) return; const myId = localStorage.getItem('myUserId'); const blockRef = database.ref(`users/${myId}/blocked/${currentProfileUid}`);
    blockRef.once('value').then(snap => {
        if (snap.exists()) { 
            blockRef.remove().then(() => { 
                document.getElementById('blockMenuBtn').innerHTML = "🚫 Заблокировать"; 
                document.getElementById('writeMessageBtn').style.display = 'block'; 
                loadBlockedUsersList(); 
                if (currentRoomId.includes(currentProfileUid)) loadChat(currentRoomId, document.getElementById('chatTitle').textContent); 
            }); 
        } else {
            const delChat = confirm("Заблокировать? ОК = Удалить чат. Отмена = Оставить."); 
            blockRef.set(true).then(() => {
                if(delChat) { const roomId = [myId, currentProfileUid].sort().join('_'); database.ref(`userChats/${myId}/${roomId}`).remove(); database.ref(`chats/${roomId}`).remove(); closeProfileModal(); closeChat(); } 
                else { 
                    document.getElementById('blockMenuBtn').innerHTML = "✅ Разблокировать"; 
                    document.getElementById('writeMessageBtn').style.display = 'none'; 
                    if (currentRoomId.includes(currentProfileUid)) loadChat(currentRoomId, document.getElementById('chatTitle').textContent); 
                }
                loadBlockedUsersList();
            });
        }
    });
}
function loadUserProfileInModal(uid) {
    const av = document.getElementById('profAvatar'), name = document.getElementById('profName'), uname = document.getElementById('profUsername'), bio = document.getElementById('profBio'), subs = document.getElementById('profSubs'), writeBtn = document.getElementById('writeMessageBtn'), bannerEl = document.getElementById('profBanner'), optBtn = document.getElementById('profOptionsBtn');
    const myId = localStorage.getItem('myUserId');
    database.ref('users/' + uid).once('value').then((snap) => {
        const data = snap.val(); if(!data) return;
        name.textContent = data.displayName || data.username || "Без имени"; uname.textContent = '@' + (data.username || "unknown"); bio.textContent = data.bio || "Описание не добавлено...";
        if(data.avatarUrl) { av.textContent = ''; av.style.backgroundImage = `url(${data.avatarUrl})`; av.style.backgroundColor = 'transparent'; } else { av.textContent = data.username ? data.username[0].toUpperCase() : '?'; av.style.backgroundColor = '#4fc3f7'; av.style.backgroundImage = 'none'; }
        if (bannerEl) { if(data.bannerUrl) bannerEl.style.backgroundImage = `url(${data.bannerUrl})`; else { bannerEl.style.backgroundImage = 'none'; bannerEl.style.backgroundColor = '#2b5278'; } }
        database.ref('status/' + uid).once('value').then(sSnap => { const status = sSnap.val(); if(status && status.state === 'online') subs.innerHTML = `Пользователь <span class="online-dot"></span>`; else subs.textContent = "Пользователь (офлайн)"; });
        if (uid !== myId) { 
            if (optBtn) optBtn.style.display = 'block'; 
            if (writeBtn) writeBtn.style.display = 'block';
            database.ref(`users/${myId}/blocked/${uid}`).once('value').then(bSnap => { 
                if(bSnap.exists()) { document.getElementById('blockMenuBtn').innerHTML = "✅ Разблокировать"; if(writeBtn) writeBtn.style.display = 'none'; } 
                else { document.getElementById('blockMenuBtn').innerHTML = "🚫 Заблокировать"; } 
            }); 
            const roomId = [myId, uid].sort().join('_');
            loadProfileMedia(roomId);
        }
    });
}function loadProfileMedia(roomId) {
    const mediaList = document.getElementById('profMediaList'); if (!mediaList) return;
    mediaList.innerHTML = '<div style="padding:10px; font-size:12px; color:#aaa; grid-column: span 3;">Загрузка...</div>';
    database.ref('chats/' + roomId).orderByChild('timestamp').limitToLast(20).once('value').then(snap => {
        mediaList.innerHTML = ''; let count = 0;
        snap.forEach(child => {
            const msg = child.val();
            if (msg.image) {
                const img = document.createElement('img');
                img.src = msg.image; img.style.width = '100%'; img.style.height = '100px'; img.style.objectFit = 'cover'; img.style.cursor = 'pointer';
                img.onclick = () => openLightbox(msg.image);
                mediaList.appendChild(img); count++;
            }
        });
        if (count === 0) mediaList.innerHTML = '<div style="padding:10px; font-size:12px; color:#aaa; grid-column: span 3;">Нет медиафайлов</div>';
    });
}
function openProfileModal(targetUid = null) {
    if (!targetUid && currentRoomId === 'global') return;
    const av = document.getElementById('profAvatar'), name = document.getElementById('profName'), uname = document.getElementById('profUsername'), bio = document.getElementById('profBio'), subs = document.getElementById('profSubs'), writeBtn = document.getElementById('writeMessageBtn'), optBtn = document.getElementById('profOptionsBtn'), muteCont = document.getElementById('muteSettingContainer'), mediaCont = document.getElementById('profMediaContainer');
    if(!document.getElementById('profileModal')) return; name.textContent = "Загрузка..."; showModal('profileModal');
    [writeBtn, optBtn, muteCont].forEach(btn => { if(btn) btn.style.display = 'none'; }); bio.textContent = ''; av.style.backgroundImage = 'none';
    const myId = localStorage.getItem('myUserId');
    if (targetUid) { currentProfileUid = targetUid; loadUserProfileInModal(targetUid); if (mediaCont) mediaCont.style.display = 'block'; } 
    else {
        const otherUid = currentRoomId.split('_').find(id => id !== myId);
        if(otherUid) { currentProfileUid = otherUid; loadUserProfileInModal(otherUid); if (mediaCont) mediaCont.style.display = 'block'; }
    }
}
function closeProfileModal() { hideModal('profileModal'); }function toggleChatOptions() {
    const menu = document.getElementById('chatContextMenu');
    if (!menu) return;
    if (menu.classList.contains('show')) { menu.classList.remove('show'); }
    else { menu.style.top = '60px'; menu.style.right = '15px'; menu.classList.add('show'); }
}
function clearChatHistory() {
    if (!confirm("Очистить историю чата для всех?")) return;
    const myId = localStorage.getItem('myUserId');
    database.ref('chats/' + currentRoomId).remove();
    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: "История очищена", timestamp: Date.now() });
    document.getElementById('chatContextMenu').classList.remove('show');
    loadChat(currentRoomId, document.getElementById('chatTitle').textContent);
}
function openChat(roomId, title, element) {
    currentRoomId = roomId; cancelReply(); closeContextMenu(); closeFullReactions(); 
    document.getElementById('emojiPanel').style.display = 'none'; document.getElementById('mentionPopup').style.display = 'none'; document.getElementById('chatSearchContainer').classList.remove('open');
    document.getElementById('chatContextMenu').classList.remove('show');
    const chatList = document.getElementById('chatList'); if(chatList) { for(let i=0; i<chatList.children.length; i++){ chatList.children[i].classList.remove('active'); } } if(element) element.classList.add('active'); else loadMyChatsList(); 
    if (roomId !== 'global') { database.ref(`userChats/${localStorage.getItem('myUserId')}/${roomId}`).update({ unreadCount: 0 }); }
    loadChat(roomId, title); const cArea = document.getElementById('chatArea'); if(cArea) cArea.classList.add('active'); const bNav = document.getElementById('bottomNav'); if(bNav) bNav.style.display = 'none'; const fab = document.getElementById('fabCreate'); if(fab) fab.style.display = 'none';
}
function closeChat() {
    const cArea = document.getElementById('chatArea'); if(cArea) cArea.classList.remove('active');
    if (currentRoomRef) { currentRoomRef.off(); } if (currentTypingRef) { currentTypingRef.off(); } if (currentStatusRef) { currentStatusRef.off(); } if (currentBlockRef1) { currentBlockRef1.off(); currentBlockRef1 = null; } if (currentBlockRef2) { currentBlockRef2.off(); currentBlockRef2 = null; }
    currentRoomId = 'global'; loadMyChatsList(); const bNav = document.getElementById('bottomNav'); if(bNav) bNav.style.display = 'flex'; const fab = document.getElementById('fabCreate'); if(fab) fab.style.display = 'flex';
    const menu = document.getElementById('chatContextMenu'); if(menu) menu.classList.remove('show');
}function loadChat(roomId, title) {
    const titleEl = document.getElementById('chatTitle'); if(titleEl) titleEl.textContent = title || 'Чат'; const messagesContainer = document.getElementById('messages'); 
    if(messagesContainer) { messagesContainer.innerHTML = ''; messagesContainer.scrollTop = 0; document.getElementById('scrollDownBtn').style.display = 'none'; messagesContainer.onscroll = () => { if(messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight > 300) { document.getElementById('scrollDownBtn').style.display = 'flex'; } else { document.getElementById('scrollDownBtn').style.display = 'none'; } }; const myId = localStorage.getItem('myUserId'); database.ref(`userChats/${myId}/${roomId}/hidden`).once('value').then(hSnap => { hiddenMessages = hSnap.val() || {}; }); } 
    messagesCache = {}; 
    if (currentRoomRef) { currentRoomRef.off(); } if (currentTypingRef) { currentTypingRef.off(); } if (currentStatusRef) { currentStatusRef.off(); } if (currentBlockRef1) { currentBlockRef1.off(); currentBlockRef1 = null; } if (currentBlockRef2) { currentBlockRef2.off(); currentBlockRef2 = null; }
    const inputArea = document.getElementById('messageInputArea'); const blockedBanner = document.getElementById('chatBlockedBanner'); const youBlockedBanner = document.getElementById('youAreBlockedBanner'); const myId = localStorage.getItem('myUserId'); let typingState = { name: "", isTyping: false }; let onlineState = false;
    function updateTitle() { const tEl = document.getElementById('chatTitle'); if(!tEl) return; if (typingState.isTyping) tEl.textContent = `${typingState.name} печатает...`; else if (onlineState && roomId !== 'global' && !roomId.startsWith('ch_') && !roomId.startsWith('gr_')) tEl.innerHTML = `${title || 'Чат'} <span class="online-dot"></span>`; else tEl.textContent = title || 'Чат'; }
    currentTypingRef = database.ref('typing/' + roomId); currentTypingRef.on('value', (snap) => { const typingData = snap.val(); typingState.isTyping = false; if (typingData) { for (const uid in typingData) { if (uid !== myId && typingData[uid].isTyping) { typingState.isTyping = true; typingState.name = typingData[uid].name; } } } updateTitle(); });if (roomId !== 'global' && !roomId.startsWith('ch_') && !roomId.startsWith('gr_')) {
    const otherUid = roomId.split('_').find(id => id !== myId);
    if(otherUid) { 
        currentStatusRef = database.ref('status/' + otherUid); 
        currentStatusRef.on('value', (sSnap) => { const status = sSnap.val(); onlineState = (status && status.state === 'online'); updateTitle(); }); 
        currentBlockRef1 = database.ref(`users/${myId}/blocked/${otherUid}`); 
        currentBlockRef1.on('value', (bSnap) => { 
            if(bSnap.exists()) { inputArea.style.display = 'none'; blockedBanner.style.display = 'block'; youBlockedBanner.style.display = 'none'; } 
            else { 
                currentBlockRef2 = database.ref(`users/${otherUid}/blocked/${myId}`); 
                currentBlockRef2.on('value', (bSnap2) => { 
                    if(bSnap2.exists()) { inputArea.style.display = 'none'; blockedBanner.style.display = 'none'; youBlockedBanner.style.display = 'block'; } 
                    else { inputArea.style.display = 'flex'; blockedBanner.style.display = 'none'; youBlockedBanner.style.display = 'none'; } 
                }); 
            } 
        }); 
    }
} else { if(inputArea) inputArea.style.display = 'flex'; if(blockedBanner) blockedBanner.style.display = 'none'; if(youBlockedBanner) youBlockedBanner.style.display = 'none'; }

if (roomId.startsWith('ch_')) { 
    database.ref('channels/' + roomId).once('value').then((snap) => { 
        const chData = snap.val(); 
        if (chData && chData.owner !== myId) { if(inputArea) inputArea.style.display = 'none'; } 
        else { if(inputArea) inputArea.style.display = 'flex'; } 
    }); 
}
let viewedStr = localStorage.getItem(`viewed_${myId}_${roomId}`); 
let viewedMessages = []; 
try { if(viewedStr) viewedMessages = JSON.parse(viewedStr); } catch(e) { console.error(e); } 
currentRoomRef = database.ref('chats/' + roomId);database.ref(`chats/${roomId}/pinned`).on('value', snap => {
    const pinned = snap.val(); const banner = document.getElementById('pinnedBanner');
    if (pinned) { banner.style.display = 'flex'; banner.setAttribute('data-msgid', pinned.msgId); document.getElementById('pinnedText').textContent = pinned.sender + ": " + pinned.text; } 
    else { banner.style.display = 'none'; }
});

currentRoomRef.on('child_added', function(snapshot) {
    const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
    if(hiddenMessages[msgId]) return;
    try { renderMessage(msgId, msg, roomId, myId, messagesContainer, viewedMessages); if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; } catch (e) { console.error(e); }
    
    if (msg.userId !== myId) { 
        const isFresh = (Date.now() - msg.timestamp) < 5000; 
        if (isFresh) { 
            database.ref(`userChats/${myId}/${roomId}/muted`).once('value').then(mSnap => { 
                if (!mSnap.val()) { 
                    const audio = document.getElementById('notifySound'); 
                    if (audio) { audio.currentTime = 0; audio.play().catch(e => console.log('Звук заблокирован')); } 
                    if (!document.hasFocus() && Notification.permission === "granted") { new Notification("WizChat", { body: (msg.username || "Кто-то") + ": " + (msg.text || "Медиа") }); } 
                } 
            }).catch(e => console.log(e)); 
        } 
        if (!msg.read) { database.ref(`chats/${roomId}/${msgId}`).update({ read: true }); } 
        if (roomId !== 'global') { database.ref(`userChats/${myId}/${roomId}`).update({ unreadCount: 0 }); } 
    }
});    currentRoomRef.on('child_removed', function(snapshot) { const el = document.getElementById('msg_wrap_' + snapshot.key); if (el) el.remove(); });
    currentRoomRef.on('child_changed', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
        const reactionsDiv = document.getElementById('reactions_' + msgId); if (reactionsDiv) { reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {}, msgId, roomId); } 
        const viewsSpan = document.getElementById('views_' + msgId); if(viewsSpan) viewsSpan.textContent = msg.views || 0;
        const tickSpan = document.getElementById('tick_' + msgId); if(tickSpan) { if(msg.read) { tickSpan.className = 'msg-tick read'; tickSpan.textContent = '✓✓'; } else { tickSpan.className = 'msg-tick'; tickSpan.textContent = '✓'; } }
        const textDiv = document.getElementById('text_' + msgId); if(textDiv && msg.edited && !msg.image && !msg.audio) { 
            let parsedText = msg.text.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="event.stopPropagation(); openProfileByUsername(\'$1\')">@$1</span>'); 
            textDiv.innerHTML = `${parsedText} <span style="font-size:10px; color:#aaa;">(изм.)</span> <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`; 
        }
    });
}function renderMessage(msgId, msg, roomId, myId, container, viewedMessages) {
    if(!container) return; 
    if (msg.type === 'system') { const sysDiv = document.createElement('div'); sysDiv.style.textAlign = 'center'; sysDiv.style.color = '#aaa'; sysDiv.style.fontSize = '12px'; sysDiv.style.margin = '10px 0'; sysDiv.textContent = msg.text; container.appendChild(sysDiv); return; }
    const wrapper = document.createElement('div'); wrapper.className = 'message-wrapper ' + ((msg.userId === myId) ? 'sent' : 'received'); wrapper.id = 'msg_wrap_' + msgId; 
    const newMessage = document.createElement('div'); newMessage.className = 'message ' + ((msg.userId === myId) ? 'sent' : 'received'); 
    newMessage.onclick = function(e) { e.stopPropagation(); showMessageActions(msgId, msg.userId === myId); };
    let replyHTML = ''; if (msg.replyTo) replyHTML = `<div class="msg-reply-block" onclick="event.stopPropagation(); scrollToMsg('${msg.replyTo.msgId || ''}')"><span class="msg-reply-name">${msg.replyTo.name}</span><span class="msg-reply-text">${msg.replyTo.text}</span></div>`; 
    const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    if (msg.userId !== myId && msg.username) { 
        database.ref('users/' + msg.userId).once('value').then((uSnap) => { 
            const uData = uSnap.val(); let avStyle = uData && uData.avatarUrl ? `background-image:url(${uData.avatarUrl}); color:transparent;` : ``; let avText = uData && uData.avatarUrl ? '' : (msg.username ? msg.username[0].toUpperCase() : '?'); 
            const senderInfo = document.createElement('div'); senderInfo.className = 'sender-info'; senderInfo.onclick = function(e) { e.stopPropagation(); openProfileModal(msg.userId); }; senderInfo.style.cursor = 'pointer'; senderInfo.innerHTML = `<div class="sender-avatar" style="${avStyle}">${avText}</div><span class="sender-name">${msg.username}</span>`; wrapper.insertBefore(senderInfo, newMessage); 
        }); 
    }    const editedMark = msg.edited ? `<span style="font-size:10px; color:#aaa;">(изм.)</span>` : ''; 
    let tickHTML = ''; if (msg.userId === myId) { tickHTML = msg.read ? `<span id="tick_${msgId}" class="msg-tick read">✓✓</span>` : `<span id="tick_${msgId}" class="msg-tick">✓</span>`; }
    if (msg.image) { 
        newMessage.innerHTML = replyHTML + `<img src="${msg.image}" class="message-image" alt="Фото" onclick="event.stopPropagation(); openLightbox('${msg.image}')"><div style="text-align:right; margin-top:2px;"><span class="msg-time">${timeString}</span>${tickHTML}</div>`; 
    } else if (msg.audio) { 
        newMessage.innerHTML = replyHTML + `<audio controls class="audio-player" src="${msg.audio}" onclick="event.stopPropagation()"></audio><div style="text-align:right; margin-top:2px;"><span class="msg-time">${timeString}</span>${tickHTML}</div>`; 
    } else { 
        let parsedText = msg.text.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="event.stopPropagation(); openProfileByUsername(\'$1\')">@$1</span>'); 
        newMessage.innerHTML = replyHTML + `<div id="text_${msgId}">${parsedText} ${editedMark} <span class="msg-time">${timeString}</span>${tickHTML}</div>`; 
    }
    wrapper.appendChild(newMessage); 
    if (roomId.startsWith('ch_') && msg.userId !== myId && !viewedMessages.includes(msgId)) { viewedMessages.push(msgId); localStorage.setItem(`viewed_${myId}_${roomId}`, JSON.stringify(viewedMessages)); database.ref(`chats/${roomId}/${msgId}/views`).transaction((v) => (v || 0) + 1); }
    let viewsHTML = ''; if (roomId.startsWith('ch_')) viewsHTML = `<div class="views-count">👁️ <span id="views_${msgId}">${msg.views || 0}</span></div>`; 
    const reactionsDiv = document.createElement('div'); reactionsDiv.id = 'reactions_' + msgId; reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {}, msgId, roomId); 
    wrapper.appendChild(reactionsDiv); if (viewsHTML) wrapper.insertAdjacentHTML('beforeend', viewsHTML); container.appendChild(wrapper);
}function getReactionsHTML(reactions, msgId, roomId) { let html = ''; for (const [emoji, users] of Object.entries(reactions)) { if (users.length > 0) { html += `<span onclick="event.stopPropagation(); toggleReaction(event, '${roomId}', '${msgId}', '${emoji}')" style="cursor:pointer; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 10px; font-size: 12px; margin-right: 5px; margin-top: 5px; display: inline-block;">${emoji} ${users.length}</span>`; } } return html; }
function openProfileByUsername(username) { database.ref('users').orderByChild('username').equalTo(username).once('value', snap => { if(snap.exists()) { snap.forEach(child => { openProfileModal(child.key); }); } }); }
function toggleChatSearch() { const container = document.getElementById('chatSearchContainer'); const input = document.getElementById('chatSearchInput'); if (!container) return; container.classList.toggle('open'); if (container.classList.contains('open')) { input.focus(); } else { input.value = ''; filterChatMessages(''); } }
function filterChatMessages(query) { const q = (query || '').toLowerCase().trim(); const container = document.getElementById('messages'); if (!container) return; Array.from(container.children).forEach(el => { if (el.id && el.id.startsWith('msg_wrap_')) { const msgId = el.id.replace('msg_wrap_', ''); const msg = messagesCache[msgId]; if (msg) { el.style.display = (!q || (msg.text || '').toLowerCase().includes(q)) ? 'flex' : 'none'; } } }); }
function toggleMuteChat() { if (!currentRoomId || currentRoomId === 'global') return; const myId = localStorage.getItem('myUserId'); const isChecked = document.getElementById('muteToggle').checked; database.ref(`userChats/${myId}/${currentRoomId}`).update({ muted: isChecked }); }function showMessageActions(msgId, isMine) {
    const msg = messagesCache[msgId]; if(!msg) return;
    currentMenuMsgId = msgId; clearTimeout(menuCloseTimeout);
    const overlay = document.getElementById('menuOverlay'); const menu = document.getElementById('msgContextMenu');
    if(overlay) { overlay.style.display = 'block'; setTimeout(() => overlay.classList.add('show'), 10); } 
    if(menu) { menu.style.display = 'flex'; setTimeout(() => menu.classList.add('show'), 10); }
    const msgWrap = document.getElementById('msg_wrap_' + msgId);
    if (msgWrap && menu) { const rect = msgWrap.getBoundingClientRect(); let leftPos = rect.left; let topPos = rect.top - 180; if (topPos < 10) { topPos = rect.bottom + 10; } if (leftPos + 200 > window.innerWidth) { leftPos = window.innerWidth - 210; } if (leftPos < 10) { leftPos = 10; } menu.style.left = leftPos + 'px'; menu.style.top = topPos + 'px'; }
    const quickReacts = ['❤️', '👍', '🔥', '😂', '😢']; let reactHTML = `<div class="reaction-list-5">`; quickReacts.forEach(e => { reactHTML += `<button onclick="toggleReaction(event, '${currentRoomId}', '${msgId}', '${e}'); closeContextMenu();">${e}</button>`; }); reactHTML += `</div><button class="btn-more-reactions" onclick="openFullReactions('${msgId}')">»</button>`;
    const reactionsDiv = document.getElementById('contextReactions'); if(reactionsDiv) reactionsDiv.innerHTML = reactHTML;
    const actionsDiv = document.getElementById('contextActions');
    if(actionsDiv) {
        actionsDiv.innerHTML = `<button onclick="setReply('${msgId}'); closeContextMenu();">↩️ Ответить</button>`;
        actionsDiv.innerHTML += `<button onclick="copyMessage('${msgId}'); closeContextMenu();">📋 Копировать</button>`;
        actionsDiv.innerHTML += `<button onclick="openForwardModal('${msgId}'); closeContextMenu();">➡️ Переслать</button>`;
        actionsDiv.innerHTML += `<button onclick="pinMessage('${msgId}'); closeContextMenu();">📌 Закрепить</button>`;
        const isChannel = currentRoomId.startsWith('ch_'); const isGlobal = currentRoomId === 'global';
        if (isMine || (!isChannel && !isGlobal)) { actionsDiv.innerHTML += `<button class="red-btn" onclick="deleteMessage('${currentRoomId}', '${msgId}'); closeContextMenu();">🗑️ Удалить</button>`; }
        if (isMine && !msg.image && !msg.audio) { actionsDiv.innerHTML += `<button onclick="editMessage('${msgId}'); closeContextMenu();">✏️ Изменить</button>`; }
    }
}
function copyMessage(msgId) { const msg = messagesCache[msgId]; if(!msg) return; navigator.clipboard.writeText(msg.text).then(() => alert("Текст скопирован!")).catch(() => alert("Ошибка копирования")); }
function openForwardModal(msgId) {
    const msg = messagesCache[msgId]; if(!msg) return; forwardMsgData = { text: msg.text, image: msg.image || null, audio: msg.audio || null, isForwarded: true };
    showModal('forwardModal'); const list = document.getElementById('forwardChatList'); list.innerHTML = "Загрузка..."; const myId = localStorage.getItem('myUserId');
    database.ref('userChats/' + myId).once('value').then(snap => { list.innerHTML = ""; const chats = snap.val() || {}; for (const roomId in chats) { const div = document.createElement('div'); div.className = 'chat-item'; div.style.padding = '10px'; div.style.cursor = 'pointer'; div.innerHTML = `<div class="chat-name" style="font-weight:bold;">${chats[roomId].username || 'Без имени'}</div>`; div.onclick = () => { forwardMessageToChat(roomId, msgId); }; list.appendChild(div); } });
}
function forwardMessageToChat(targetRoomId, originalMsgId) {
    const myId = localStorage.getItem('myUserId');
    database.ref('users/' + myId).once('value').then(snap => { const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const msgData = { ...forwardMsgData, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false }; database.ref('chats/' + targetRoomId).push(msgData).then(() => { database.ref(`userChats/${myId}/${targetRoomId}`).update({ lastMessage: "Пересланное сообщение", timestamp: Date.now() }); hideModal('forwardModal'); alert("Переслано!"); }); });
}function pinMessage(msgId) { const msg = messagesCache[msgId]; if(!msg) return; database.ref(`chats/${currentRoomId}/pinned`).set({ msgId: msgId, text: msg.text || "Медиа", sender: msg.username }); }
function unpinMessage(event) { event.stopPropagation(); database.ref(`chats/${currentRoomId}/pinned`).remove(); }
function openFullReactions(msgId) { currentMenuMsgId = msgId; const grid = document.getElementById('fullReactionsGrid'); const allEmojis = ['🤝','😎','💀','🙏','😭','🤔','😞','😯','👎','❤️‍🔥','👍','🔥','❤️','😂','😢','😡','🎉','🥳','🤩','😍','🤮','🤡','💩','👻','🤖','💯','👀','👌']; let html = ''; allEmojis.forEach(e => { html += `<button onclick="toggleReaction(event, '${currentRoomId}', '${msgId}', '${e}'); closeFullReactions(); closeContextMenu();">${e}</button>`; }); grid.innerHTML = html; showModal('fullReactionsModal'); }
function closeFullReactions() { hideModal('fullReactionsModal'); }
function closeContextMenu() { const overlay = document.getElementById('menuOverlay'); const menu = document.getElementById('msgContextMenu'); if(overlay) overlay.classList.remove('show'); if(menu) menu.classList.remove('show'); menuCloseTimeout = setTimeout(() => { if(overlay) overlay.style.display = 'none'; if(menu) menu.style.display = 'none'; }, 200); currentMenuMsgId = null; }
function editMessage(msgId) { const msg = messagesCache[msgId]; if(!msg || msg.image || msg.audio) return; const newText = prompt("Изменить сообщение:", msg.text); if (newText !== null && newText.trim() !== "" && newText !== msg.text) { database.ref(`chats/${currentRoomId}/${msgId}`).update({ text: newText, edited: true }); } }
function setReply(msgId) { const msg = messagesCache[msgId]; if(!msg) return; activeReplyContext = { name: msg.username || 'Аноним', text: msg.text, msgId: msgId }; const rp = document.getElementById('replyPreview'); if(rp) { rp.style.display = 'flex'; document.getElementById('replyPreviewName').textContent = activeReplyContext.name; document.getElementById('replyPreviewText').textContent = activeReplyContext.text; } document.getElementById('msgInput').focus(); }
function cancelReply() { activeReplyContext = null; const rp = document.getElementById('replyPreview'); if(rp) rp.style.display = 'none'; }
function toggleReaction(event, roomId, msgId, emoji) {
    spawnReactionEffect(event, emoji); const myId = localStorage.getItem('myUserId');
    database.ref(`chats/${roomId}/${msgId}/reactions`).transaction((reactions) => {
        reactions = reactions || {}; let hasReacted = false; if (reactions[emoji] && reactions[emoji].includes(myId)) hasReacted = true;
        for (let key in reactions) { if (Array.isArray(reactions[key]) && reactions[key].includes(myId)) { reactions[key] = reactions[key].filter(id => id !== myId); if (reactions[key].length === 0) delete reactions[key]; } }
        if (!hasReacted) { if (!reactions[emoji]) reactions[emoji] = []; reactions[emoji].push(myId); }
        return reactions;
    });
}
function spawnReactionEffect(event, emoji) { if(!event) return; const x = event.clientX || (event.touches && event.touches[0].clientX) || 0; const y = event.clientY || (event.touches && event.touches[0].clientY) || 0; for(let i=0; i<5; i++) { const p = document.createElement('div'); p.className = 'reaction-particle'; p.textContent = emoji; p.style.left = x + 'px'; p.style.top = y + 'px'; const angle = Math.random() * Math.PI * 2; const distance = 40 + Math.random() * 60; p.style.setProperty('--x', Math.cos(angle) * distance + 'px'); p.style.setProperty('--y', Math.sin(angle) * distance + 'px'); document.body.appendChild(p); setTimeout(() => p.remove(), 600); } }
function deleteMessage(roomId, msgId) { if(confirm("ОК = Удалить у всех.\nОтмена = Удалить только у себя.")) { database.ref(`chats/${roomId}/${msgId}`).remove(); } else { const myId = localStorage.getItem('myUserId'); database.ref(`userChats/${myId}/${roomId}/hidden/${msgId}`).set(true); const el = document.getElementById('msg_wrap_' + msgId); if (el) el.remove(); } }function sendMessage() {
    const input = document.getElementById('msgInput'); if(!input) return; const text = input.value; const myId = localStorage.getItem('myUserId'); if (text.length > 500) return alert("Максимум 500 символов.");
    if (text.trim() !== "" && myId) {
        database.ref('users/' + myId).once('value').then((snap) => {
            const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const myAvatar = myData ? myData.avatarUrl : null; const msgData = { text: text, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false }; if (activeReplyContext) msgData.replyTo = activeReplyContext;
            pushMsg(msgData, text);
            input.value = ""; cancelReply(); input.focus(); database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false }); clearTimeout(typingTimeout); document.getElementById('emojiPanel').style.display = 'none';
            if (currentRoomId !== 'global' && !currentRoomId.startsWith('ch_') && !currentRoomId.startsWith('gr_')) {
                const otherUid = currentRoomId.split('_').find(id => id !== myId);
                if(otherUid) { const otherChatRef = database.ref(`userChats/${otherUid}/${currentRoomId}`); otherChatRef.update({ username: myName, avatarUrl: myAvatar, lastMessage: text, timestamp: Date.now() }); otherChatRef.child('unreadCount').transaction((count) => (count || 0) + 1); }
            }
        });
    }
}
function pushMsg(msgData, textPreview) { const myId = localStorage.getItem('myUserId'); database.ref('chats/' + currentRoomId).push(msgData).then(() => { cancelReply(); if (currentRoomId !== 'global') { database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: textPreview, timestamp: Date.now() }); } }); }
const quickEmojis = ['😀','😂','😍','🥰','😎','😭','🤔','👍','🔥','❤️','🎉','🙏','🤡','💩','👻','💀','🤖','💯','👀','👌'];
function toggleEmojiPanel() { const panel = document.getElementById('emojiPanel'); if (panel.style.display === 'none') { if(panel.innerHTML === '') { let html = ''; quickEmojis.forEach(e => { html += `<button class="emoji-btn" onclick="addEmoji('${e}')">${e}</button>`; }); panel.innerHTML = html; } panel.style.display = 'grid'; } else { panel.style.display = 'none'; } }
function addEmoji(emoji) { const input = document.getElementById('msgInput'); input.value += emoji; input.focus(); }
document.getElementById('msgInput').addEventListener('keypress', function (e) { if (e.key === 'Enter') { const popup = document.getElementById('mentionPopup'); if(popup.style.display === 'flex') { const firstItem = popup.querySelector('.mention-item'); if(firstItem) { firstItem.click(); e.preventDefault(); return; } } sendMessage(); } });function handleMentionInput(event) {
    const input = event.target; const val = input.value; const cursorPos = input.selectionStart; const textBeforeCursor = val.slice(0, cursorPos); const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/); const popup = document.getElementById('mentionPopup');
    if (match) { const query = match[1].toLowerCase(); database.ref('users').once('value').then(snap => { allUsersCache = []; snap.forEach(child => { const u = child.val(); if(u.username && u.username.toLowerCase().includes(query) && child.key !== localStorage.getItem('myUserId') && !u.privateAccount) { allUsersCache.push(u); } }); if(allUsersCache.length > 0) { let html = ''; allUsersCache.slice(0, 5).forEach(u => { html += `<div class="mention-item" onclick="insertMention('${u.username}')">@${u.username}</div>`; }); popup.innerHTML = html; popup.style.display = 'flex'; } else { popup.style.display = 'none'; } }); } else { popup.style.display = 'none'; }
}
function insertMention(username) { const input = document.getElementById('msgInput'); const val = input.value; const cursorPos = input.selectionStart; const textBeforeCursor = val.slice(0, cursorPos); const textAfterCursor = val.slice(cursorPos); input.value = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, '@' + username + ' ') + textAfterCursor; input.focus(); document.getElementById('mentionPopup').style.display = 'none'; }
document.getElementById('msgInput').addEventListener('input', () => {
    const myId = localStorage.getItem('myUserId'); if (!myId || !currentRoomId) return;
    database.ref(`users/${myId}`).once('value').then(uSnap => { const myData = uSnap.val(); const myName = myData ? (myData.displayName || myData.username) : "Кто-то"; database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: true, name: myName }); clearTimeout(typingTimeout); typingTimeout = setTimeout(() => { database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false }); }, 2000); });
});
function handleImageUpload(event) {
    const file = event.target.files[0]; if (!file) return; const btn = event.target.nextElementSibling; const originalText = btn.innerHTML; btn.innerHTML = "⏳"; btn.disabled = true;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); let width = img.width; let height = img.height;
            if (width > 600) { height = Math.round(height * (600 / width)); width = 600; }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6); btn.innerHTML = originalText; btn.disabled = false; event.target.value = ''; sendChatImage(base64);
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
}
function sendChatImage(base64Image) { const myId = localStorage.getItem('myUserId'); if (!myId) return; database.ref('users/' + myId).once('value').then((snap) => { const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const msgData = { text: "📷 Фотография", image: base64Image, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false }; if (activeReplyContext) msgData.replyTo = activeReplyContext; pushMsg(msgData, "📷 Фотография"); }); }function toggleRecording() {
    const micBtn = document.getElementById('micBtn');
    if (!isRecording) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream); audioChunks = [];
            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
            mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); const reader = new FileReader(); reader.onloadend = () => { sendChatVoice(reader.result); stream.getTracks().forEach(track => track.stop()); }; reader.readAsDataURL(audioBlob); };
            mediaRecorder.start(); isRecording = true; micBtn.classList.add('recording');
            recordingTimeout = setTimeout(() => { if (isRecording) toggleRecording(); }, 30000);
        }).catch(err => { alert("Нет доступа к микрофону!"); console.error(err); });
    } else { mediaRecorder.stop(); isRecording = false; micBtn.classList.remove('recording'); clearTimeout(recordingTimeout); }
}
function sendChatVoice(base64Audio) { const myId = localStorage.getItem('myUserId'); if (!myId) return; database.ref('users/' + myId).once('value').then((snap) => { const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const msgData = { text: "🎤 Голосовое", audio: base64Audio, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false }; if (activeReplyContext) msgData.replyTo = activeReplyContext; pushMsg(msgData, "🎤 Голосовое"); }); }function applySettings() { const theme = localStorage.getItem('appTheme'); if (theme === 'light') document.body.classList.add('light-theme'); else document.body.classList.remove('light-theme'); document.body.classList.remove('font-small', 'font-medium', 'font-large'); document.body.classList.add('font-' + (localStorage.getItem('msgFontSize') || 'medium')); const savedColor = localStorage.getItem('myBubbleColor'); if(savedColor) document.documentElement.style.setProperty('--msg-sent-bg', savedColor); }
function changeBubbleColor(color) { document.documentElement.style.setProperty('--msg-sent-bg', color); localStorage.setItem('myBubbleColor', color); }
function changeTheme(theme) { localStorage.setItem('appTheme', theme); applySettings(); }
function changeFontSize(size) { localStorage.setItem('msgFontSize', size); applySettings(); }
function loadSettingsToggles() { const myId = localStorage.getItem('myUserId'); if(!myId) return; database.ref('users/' + myId).once('value').then(snap => { const data = snap.val(); if(data) { document.getElementById('privateAccountToggle').checked = data.privateAccount === true; document.getElementById('forbidFirstMsgToggle').checked = data.forbidFirstMessage === true; } }); }
function togglePrivateAccount() { const myId = localStorage.getItem('myUserId'); const isChecked = document.getElementById('privateAccountToggle').checked; database.ref('users/' + myId).update({ privateAccount: isChecked }); }
function toggleForbidFirstMsg() { const myId = localStorage.getItem('myUserId'); const isChecked = document.getElementById('forbidFirstMsgToggle').checked; database.ref('users/' + myId).update({ forbidFirstMessage: isChecked }); }
function loadBlockedUsersList() { const myId = localStorage.getItem('myUserId'); const listDiv = document.getElementById('blockedList'); if(!listDiv) return; listDiv.innerHTML = "Загрузка..."; database.ref(`users/${myId}/blocked`).once('value').then(snap => { listDiv.innerHTML = ""; if(!snap.exists()) { listDiv.innerHTML = "<span style='color:gray;'>Нет заблокированных</span>"; return; } snap.forEach(child => { const blockedUid = child.key; database.ref(`users/${blockedUid}`).once('value').then(uSnap => { const uData = uSnap.val(); if(uData) { const div = document.createElement('div'); div.style = 'display:flex; justify-content:space-between; align-items:center;'; div.innerHTML = `<span>@${uData.username}</span><button onclick="unblockFromSettings('${blockedUid}')" style="background:#2ecc71; border:none; padding:5px 10px; border-radius:5px; color:white;">Разблокировать</button>`; listDiv.appendChild(div); } }); }); }); }
function unblockFromSettings(uid) { const myId = localStorage.getItem('myUserId'); database.ref(`users/${myId}/blocked/${uid}`).remove().then(() => { loadBlockedUsersList(); }); }
function unblockCurrentUser() { const myId = localStorage.getItem('myUserId'); if (!currentRoomId || currentRoomId === 'global' || currentRoomId.startsWith('ch_') || currentRoomId.startsWith('gr_')) return; const otherUid = currentRoomId.split('_').find(id => id !== myId); database.ref(`users/${myId}/blocked/${otherUid}`).remove().then(() => { loadChat(currentRoomId, document.getElementById('chatTitle').textContent); loadBlockedUsersList(); }); }function switchTab(tabId, element) { 
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active')); 
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active')); 
    const tab = document.getElementById('tab-' + tabId); if(tab) tab.classList.add('active'); 
    if(element) element.classList.add('active'); 
    if(tabId === 'settings') { loadBlockedUsersList(); loadSettingsToggles(); } 
    if(tabId === 'profile') loadProfile(); 
}
function liveSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase(); const results = document.getElementById('searchResults'); if (!results) return;
    if (!query) { results.style.display = 'none'; results.innerHTML = ''; return; }
    results.innerHTML = '<div style="padding:10px; color:gray;">Ищем...</div>'; results.style.display = 'block'; let count = 0; const myId = localStorage.getItem('myUserId');
    database.ref('users').once('value').then(snap => { snap.forEach(child => { const uid = child.key; const u = child.val(); if (uid !== myId && u.username && u.username.toLowerCase().includes(query) && !u.privateAccount) { const div = document.createElement('div'); div.className = 'search-user-item'; let avStyle = u.avatarUrl ? `background-image:url(${u.avatarUrl}); color:transparent;` : ''; let avText = u.avatarUrl ? '' : (u.username ? u.username[0].toUpperCase() : '?'); div.innerHTML = `<div class="avatar-placeholder" style="${avStyle}; width:35px; height:35px; font-size:15px;">${avText}</div><span>👤 @${u.username}</span>`; div.onclick = () => { results.style.display = 'none'; openProfileModal(uid); }; results.appendChild(div); count++; } }); });
    database.ref('channels').once('value').then(snap => { snap.forEach(child => { const id = child.key; const ch = child.val(); if (ch.username && ch.username.toLowerCase().includes(query)) { const div = document.createElement('div'); div.className = 'search-user-item'; div.innerHTML = `<div class="avatar-placeholder" style="background:#e67e22; width:35px; height:35px; font-size:15px;">#</div><span>📢 ${ch.name} (@${ch.username})</span>`; div.onclick = () => { results.style.display = 'none'; openChat(id, ch.name, null); }; results.appendChild(div); count++; } }); });
    database.ref('groups').once('value').then(snap => { snap.forEach(child => { const id = child.key; const gr = child.val(); if (gr.username && gr.username.toLowerCase().includes(query)) { const div = document.createElement('div'); div.className = 'search-user-item'; div.innerHTML = `<div class="avatar-placeholder" style="background:#2ecc71; width:35px; height:35px; font-size:15px;">G</div><span>👥 ${gr.name} (@${gr.username})</span>`; div.onclick = () => { results.style.display = 'none'; openChat(id, gr.name, null); }; results.appendChild(div); count++; } }); });
    setTimeout(() => { if (count === 0 && results.innerHTML === '<div style="padding:10px; color:gray;">Ищем...</div>') { results.innerHTML = '<div style="padding:10px; color:gray;">Ничего не найдено</div>'; } }, 600);
}function createChannel(btn) {
    const name = document.getElementById('chName').value.trim(); const username = document.getElementById('chUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); const isPrivate = document.getElementById('chPrivate').checked; const isGroup = (createType === 'group'); const myId = localStorage.getItem('myUserId');
    if (!name || !username) return alert("Заполни все поля!"); btn.disabled = true;
    database.ref('usernames/' + username).once('value').then((snap) => {
        if (snap.exists()) { btn.disabled = false; return alert("Юзернейм занят!"); }
        const inviteCode = Math.random().toString(36).substring(2, 10); const channelId = (isGroup ? 'gr_' : 'ch_') + Date.now(); const dbRef = isGroup ? 'groups/' : 'channels/';
        database.ref(dbRef + channelId).set({ name: name, username: username, isPrivate: isPrivate, inviteCode: inviteCode, owner: myId, createdAt: Date.now() }).then(() => {
            if (isGroup) database.ref(`groups/${channelId}/members/${myId}`).set(true); else { database.ref(`channels/${channelId}/subscribers`).set(1); database.ref(`channels/${channelId}/subscribersList/${myId}`).set(true); }
            database.ref('usernames/' + username).set({ type: isGroup ? 'group' : 'channel', id: channelId }); database.ref(`userChats/${myId}/${channelId}`).set({ username: name, lastMessage: isGroup ? "Группа создана!" : "Канал создан!", unreadCount: 0, timestamp: Date.now() });
            alert(isGroup ? "Группа создана!" : "Канал создан!"); btn.disabled = false; closeCreateModal(); loadMyChatsList();
        });
    });
}
function joinChannelByCode() {
    const code = document.getElementById('joinCode').value.trim(); const myId = localStorage.getItem('myUserId'); if (!code) return alert("Введи код!");
    const joinProcess = (dbRef, isGroup) => { database.ref(dbRef).orderByChild('inviteCode').equalTo(code).once('value', (snapshot) => { if (snapshot.exists()) { snapshot.forEach((child) => { const id = child.key; const data = child.val(); if (isGroup) database.ref(`groups/${id}/members/${myId}`).set(true); else { database.ref(`channels/${id}/subscribersList/${myId}`).set(true); database.ref(`channels/${id}/subscribers`).transaction(s => (s||0)+1); } database.ref(`userChats/${myId}/${id}`).set({ username: data.name, lastMessage: "Вы вошли", unreadCount: 0, timestamp: Date.now() }).then(() => { alert("Успешно!"); closeCreateModal(); loadMyChatsList(); openChat(id, data.name, null); }); }); } }); };
    database.ref('channels').orderByChild('inviteCode').equalTo(code).once('value').then(s => { if(s.exists()) joinProcess('channels', false); else joinProcess('groups', true); });
}function showMembersList() {
    if (!currentProfileChannelId) return; showModal('membersModal'); const isGroup = currentProfileChannelId.startsWith('gr_'); const dbRef = isGroup ? `groups/${currentProfileChannelId}/members` : `channels/${currentProfileChannelId}/subscribersList`; const container = document.getElementById('membersListContainer');
    document.getElementById('membersModalTitle').textContent = isGroup ? "Участники" : "Подписчики"; container.innerHTML = "Загрузка...";
    database.ref(dbRef).once('value').then(snap => {
        container.innerHTML = ""; if(!snap.exists()) { container.innerHTML = "<span style='color:gray;'>Пусто</span>"; return; }
        database.ref((isGroup ? 'groups/' : 'channels/') + currentProfileChannelId).once('value').then(chSnap => {
            const chData = chSnap.val() || {}; const ownerId = chData.owner; const admins = chData.admins || {}; const myId = localStorage.getItem('myUserId');
            snap.forEach(child => { 
                const uid = child.key; 
                database.ref('users/' + uid).once('value').then(uSnap => { 
                    const u = uSnap.val(); if(!u) return; 
                    const isOwner = (ownerId === myId); const isAdmin = (admins[myId] === true); const canManage = isOwner || isAdmin;
                    const isTargetOwner = (uid === ownerId); const isTargetAdmin = (admins[uid] === true);
                    const div = document.createElement('div'); div.style = 'display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--bg-input); padding-bottom: 5px;';
                    let adminIcon = isTargetOwner ? ' 👑' : (isTargetAdmin ? ' 🛡️' : '');
                    div.innerHTML = `<span onclick="hideModal('membersModal'); openProfileModal('${uid}')" style="cursor:pointer; color: #4fc3f7; text-decoration: underline;">@${u.username}${adminIcon}</span>`;
                    if (isGroup && canManage && !isTargetOwner) {
                        const actionDiv = document.createElement('div');
                        if (isOwner) {
                            const adminBtn = document.createElement('button'); adminBtn.textContent = isTargetAdmin ? "Снять" : "Админ"; adminBtn.style = "background:#f39c12; border:none; padding:3px 6px; border-radius:5px; color:white; cursor:pointer; margin-right:5px; font-size:12px;";
                            adminBtn.onclick = () => toggleAdmin(uid); actionDiv.appendChild(adminBtn);
                        }
                        const kickBtn = document.createElement('button'); kickBtn.textContent = "Кик"; kickBtn.style = "background:#e74c3c; border:none; padding:3px 6px; border-radius:5px; color:white; cursor:pointer; font-size:12px;";
                        kickBtn.onclick = () => kickMember(uid, isGroup); actionDiv.appendChild(kickBtn); div.appendChild(actionDiv);
                    } else if (!isGroup && isOwner && uid !== myId) {
                        const kickBtn = document.createElement('button'); kickBtn.textContent = "Кик"; kickBtn.style = "background:#e74c3c; border:none; padding:3px 6px; border-radius:5px; color:white; cursor:pointer; font-size:12px;";
                        kickBtn.onclick = () => kickMember(uid, isGroup); div.appendChild(kickBtn);
                    }
                    container.appendChild(div); 
                }); 
            });
        });
    });
}
function toggleAdmin(uid) { const ref = database.ref(`groups/${currentProfileChannelId}/admins/${uid}`); ref.once('value').then(snap => { if (snap.exists()) ref.remove(); else ref.set(true); showMembersList(); }); }
function kickMember(uid, isGroup) { if(!confirm("Выгнать?")) return; const dbRef = isGroup ? `groups/${currentProfileChannelId}/members/${uid}` : `channels/${currentProfileChannelId}/subscribersList/${uid}`; database.ref(dbRef).remove().then(() => { if(!isGroup) database.ref(`channels/${currentProfileChannelId}/subscribers`).transaction(s => (s||1)-1); database.ref(`userChats/${uid}/${currentProfileChannelId}`).remove(); if(isGroup) database.ref(`groups/${currentProfileChannelId}/admins/${uid}`).remove(); showMembersList(); }); }let globalTypingData = {};
database.ref('typing').on('value', snap => { globalTypingData = snap.val() || {}; updateChatListTyping(); });
function updateChatListTyping() {
    const myId = localStorage.getItem('myUserId');
    for (const roomId in globalTypingData) {
        const el = document.getElementById('preview_' + roomId);
        if (el) {
            let isTyping = false, tName = '';
            for (const uid in globalTypingData[roomId]) {
                if (uid !== myId && globalTypingData[roomId][uid].isTyping) { isTyping = true; tName = globalTypingData[roomId][uid].name; }
            }
            if (isTyping) el.innerHTML = `<span style="color:#4fc3f7; font-style:italic;">${tName} печатает...</span>`;
            else if (el.dataset.lastmsg) el.textContent = el.dataset.lastmsg;
        }
    }
}
function loadMyChatsList() {
    const myId = localStorage.getItem('myUserId'); if (!myId) return; const chatList = document.getElementById('chatList'); if (!chatList) return; chatList.innerHTML = '';
    database.ref('userChats/' + myId).once('value').then(snap => {
        const chats = snap.val() || {};
        const arr = Object.keys(chats).map(id => { return { id: id, data: chats[id] }; });
        arr.sort((a, b) => {
            const pA = a.data.pinned ? 1 : 0, pB = b.data.pinned ? 1 : 0;
            return pA !== pB ? pB - pA : (b.data.timestamp || 0) - (a.data.timestamp || 0);
        });
        arr.forEach(item => {
            const roomId = item.id, data = item.data, div = document.createElement('div'); div.className = 'chat-item';
            if (roomId === currentRoomId) div.classList.add('active');
            let badgeHTML = data.unreadCount > 0 ? `<span class="unread-badge">${data.unreadCount}</span>` : '';
            let pinHTML = data.pinned ? '📌 ' : '';
            let previewText = data.lastMessage || ""; if (previewText.length > 20) previewText = previewText.substring(0, 20) + '...';
            const isCh = roomId.startsWith('ch_'), isGr = roomId.startsWith('gr_'), icon = isGr ? '👥 ' : (isCh ? '📢 ' : '');
            let avStyle = data.avatarUrl ? `background-image:url(${data.avatarUrl}); color:transparent;` : `background-color:${isGr ? '#2ecc71' : (isCh ? '#e67e22' : '#4fc3f7')};`;
            let avText = data.avatarUrl ? '' : (isGr ? 'G' : (isCh ? '#' : (data.username ? data.username[0].toUpperCase() : '?')));
            div.innerHTML = `<div class="avatar-placeholder" id="avatar_wrap_${roomId}" style="${avStyle}">${avText}</div><div class="chat-info"><div class="chat-top"><div class="chat-name">${pinHTML}${icon}${data.username || 'Без имени'}</div>${badgeHTML}</div><div class="chat-last-msg" id="preview_${roomId}" data-lastmsg="${previewText.replace(/"/g, '&quot;')}">${previewText}</div></div>`;
            div.ontouchstart = (e) => startChatLongPress(e, roomId);
            div.onmousedown = (e) => startChatLongPress(e, roomId);
            div.ontouchend = () => { clearTimeout(longPressTimer); };
            div.onmouseup = () => { clearTimeout(longPressTimer); };
            div.ontouchmove = () => { clearTimeout(longPressTimer); };
            div.onclick = function() { if (!window.isLongPressed) openChat(roomId, data.username, this); };
            chatList.appendChild(div);
            if (!isCh && !isGr) {
                const otherUid = roomId.split('_').find(id => id !== myId);
                if (otherUid) { database.ref('status/' + otherUid).on('value', sSnap => { const wrap = document.getElementById('avatar_wrap_' + roomId); if (wrap) { const dot = wrap.querySelector('.chat-online-dot'); if (sSnap.val() && sSnap.val().state === 'online') { if (!dot) wrap.innerHTML += `<div class="chat-online-dot"></div>`; } else if (dot) dot.remove(); } }); }
            }
        });
        updateChatListTyping();
    });
}window.isLongPressed = false;
let longPressTimer = null;
function startChatLongPress(e, roomId) {
    window.isLongPressed = false;
    longPressTimer = setTimeout(() => {
        window.isLongPressed = true;
        currentChatMenuRoomId = roomId;
        const menu = document.getElementById('chatContextMenu');
        if (menu) {
            menu.classList.add('show');
            let clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let clientY = e.touches ? e.touches[0].clientY : e.clientY;
            menu.style.left = Math.min(clientX, window.innerWidth - 180) + 'px';
            menu.style.top = Math.min(clientY, window.innerHeight - 100) + 'px';
        }
    }, 500);
}
function closeChatContextMenu() { const menu = document.getElementById('chatContextMenu'); if (menu) menu.classList.remove('show'); }
function togglePinChat() {
    if (!currentChatMenuRoomId) return;
    const myId = localStorage.getItem('myUserId');
    const ref = database.ref(`userChats/${myId}/${currentChatMenuRoomId}/pinned`);
    ref.once('value').then(snap => { ref.set(!snap.val()); closeChatContextMenu(); loadMyChatsList(); });
}
function clearChatHistory() {
    if (!confirm("Очистить историю чата?")) return;
    const myId = localStorage.getItem('myUserId');
    database.ref('chats/' + currentRoomId).remove();
    database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: "История очищена", timestamp: Date.now() });
    document.getElementById('chatContextMenu').classList.remove('show');
    loadChat(currentRoomId, document.getElementById('chatTitle').textContent);
}function deleteChatFromProfile() {
    if(currentRoomId === 'global' || currentRoomId.startsWith('ch_') || currentRoomId.startsWith('gr_')) return;
    if(confirm("Удалить этот чат?")) { 
        const myId = localStorage.getItem('myUserId'); 
        database.ref(`userChats/${myId}/${currentRoomId}`).remove().then(() => { 
            database.ref(`chats/${currentRoomId}`).remove().then(() => { 
                closeProfileModal(); closeChat(); loadMyChatsList(); 
            }); 
        }); 
    }
}
function leaveChannel() {
    const myId = localStorage.getItem('myUserId'); if(!currentProfileChannelId) return; if(!confirm("Выйти?")) return;
    const isGroup = currentProfileChannelId.startsWith('gr_'); const dbRef = isGroup ? `groups/${currentProfileChannelId}/members/${myId}` : `channels/${currentProfileChannelId}/subscribersList/${myId}`;
    database.ref(dbRef).remove().then(() => {
        if(!isGroup) database.ref('channels/' + currentProfileChannelId + '/subscribers').transaction((subs) => (subs || 1) - 1);
        database.ref(`userChats/${myId}/${currentProfileChannelId}`).remove();
        if (isGroup) { database.ref(`users/${myId}`).once('value').then(snap => { const name = snap.val() ? (snap.val().displayName || snap.val().username) : "Пользователь"; const msg = { type: 'system', text: `${name} вышел из группы`, timestamp: Date.now(), userId: 'system' }; database.ref('chats/' + currentProfileChannelId).push(msg); }); }
        closeProfileModal(); closeChat(); loadMyChatsList(); alert("Вы вышли.");
    });
}
document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatContextMenu');
    if (menu && menu.classList.contains('show') && !menu.contains(e.target)) closeChatContextMenu();
    const profMenu = document.getElementById('profContextMenu');
    if (profMenu && profMenu.classList.contains('show') && !profMenu.contains(e.target)) profMenu.classList.remove('show');
});function startChatFromProfile() {
    if (!currentProfileUid) return;
    const myId = localStorage.getItem('myUserId');
    const roomId = [myId, currentProfileUid].sort().join('_');
    database.ref('users/' + myId).once('value').then((snap) => {
        const myData = snap.val();
        const myUsername = myData ? (myData.displayName || myData.username) : "Аноним";
        const myAvatar = myData ? myData.avatarUrl : null;
        database.ref('users/' + currentProfileUid).once('value').then((otherSnap) => {
            const otherData = otherSnap.val();
            const otherName = otherData ? (otherData.displayName || otherData.username) : "Собеседник";
            const otherAvatar = otherData ? otherData.avatarUrl : null;
            database.ref(`userChats/${myId}/${roomId}`).once('value').then(chatSnap => {
                if (!chatSnap.exists() && otherData && otherData.forbidFirstMessage) {
                    return alert("Пользователь запретил писать ему первыми.");
                }
                database.ref(`userChats/${myId}/${roomId}`).update({ username: otherName, avatarUrl: otherAvatar, lastMessage: "Чат создан", unreadCount: 0, timestamp: Date.now() });
                database.ref(`userChats/${currentProfileUid}/${roomId}`).update({ username: myUsername, avatarUrl: myAvatar, lastMessage: "Чат создан", unreadCount: 0, timestamp: Date.now() });
                closeProfileModal();
                openChat(roomId, otherName, null);
            });
        });
    });
}
function openCreateModal() { showModal('choiceCreateModal'); }
function setCreateType(type) { createType = type; hideModal('choiceCreateModal'); document.getElementById('chName').value = ''; document.getElementById('chUsername').value = ''; showModal('createModal'); }
function closeCreateModal() { hideModal('createModal'); }
applySettings();
auth.onAuthStateChanged((user) => {
    if (user) {
        localStorage.setItem('myUserId', user.uid);
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        setupOnlineStatus(user.uid);
        loadMyChatsList();
        loadProfile();
    } else {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});
if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.expand(); }
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('Ошибка SW:', err));
    });
}