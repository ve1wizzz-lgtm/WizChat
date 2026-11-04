class="chat-name">${icon}${data.username || 'Без имени'}</div>${badgeHTML}</div><div class="chat-last-msg">${previewText}</div></div>`;
                div.onclick = function() { openChat(roomId, data.username, this); }; chatList.appendChild(div);
            });
        }
    });
}

function openChat(roomId, title, element) {
    currentRoomId = roomId; cancelReply(); closeContextMenu(); closeFullReactions();
    document.getElementById('emojiPanel').style.display = 'none';
    document.getElementById('mentionPopup').style.display = 'none';
    document.getElementById('chatSearchContainer').classList.remove('open');
    
    const chatList = document.getElementById('chatList');
    if(chatList) { for(let i=0; i<chatList.children.length; i++){ chatList.children[i].classList.remove('active'); } }
    if(element) element.classList.add('active'); else loadMyChatsList(); 
    if (roomId !== 'global') { database.ref(`userChats/${localStorage.getItem('myUserId')}/${roomId}`).update({ unreadCount: 0 }); }
    loadChat(roomId, title);
    const cArea = document.getElementById('chatArea'); if(cArea) cArea.classList.add('active');
    const bNav = document.getElementById('bottomNav'); if(bNav) bNav.style.display = 'none'; 
}

function loadChat(roomId, title) {
    const titleEl = document.getElementById('chatTitle'); if(titleEl) titleEl.textContent = title || 'Чат';
    const messagesContainer = document.getElementById('messages'); if(messagesContainer) messagesContainer.innerHTML = ''; 
    messagesCache = {}; 
    if (currentRoomRef) { currentRoomRef.off(); }
    if (currentTypingRef) { currentTypingRef.off(); }
    if (currentStatusRef) { currentStatusRef.off(); }
    const inputArea = document.getElementById('messageInputArea');
    const blockedBanner = document.getElementById('chatBlockedBanner');
    const youBlockedBanner = document.getElementById('youAreBlockedBanner');
    const myId = localStorage.getItem('myUserId');
    let typingState = { name: "", isTyping: false }; let onlineState = false;

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
            database.ref(`users/${myId}/blocked/${otherUid}`).on('value', (bSnap) => {
                if(bSnap.exists()) { inputArea.style.display = 'none'; blockedBanner.style.display = 'block'; youBlockedBanner.style.display = 'none'; } 
                else {
                    database.ref(`users/${otherUid}/blocked/${myId}`).on('value', (bSnap2) => {
                        if(bSnap2.exists()) { inputArea.style.display = 'none'; blockedBanner.style.display = 'none'; youBlockedBanner.style.display = 'block'; } 
                        else { inputArea.style.display = 'flex'; blockedBanner.style.display = 'none'; youBlockedBanner.style.display = 'none'; }
                    });
                }
            });
        }
    }else { 
        if(inputArea) inputArea.style.display = 'flex'; 
        if(blockedBanner) blockedBanner.style.display = 'none';
        if(youBlockedBanner) youBlockedBanner.style.display = 'none';
    }
    if (roomId.startsWith('ch_')) {
        database.ref('channels/' + roomId).once('value').then((snap) => {
            const chData = snap.val();
            if (chData && chData.owner !== myId) { if(inputArea) inputArea.style.display = 'none'; } else { if(inputArea) inputArea.style.display = 'flex'; }
        });
    }
    let viewedStr = localStorage.getItem(`viewed_${myId}_${roomId}`);
    let viewedMessages = []; try { if(viewedStr) viewedMessages = JSON.parse(viewedStr); } catch(e) { console.error(e); }

    currentRoomRef = database.ref('chats/' + roomId);
    currentRoomRef.on('child_added', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
        renderMessage(msgId, msg, roomId, myId, messagesContainer, viewedMessages);
        if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        if (msg.userId !== myId && !msg.read) {
            database.ref(`chats/${roomId}/${msgId}`).update({ read: true });
        }
        if (msg.userId !== myId && roomId !== 'global') { database.ref(`userChats/${myId}/${roomId}`).update({ unreadCount: 0 }); }
    });
    currentRoomRef.on('child_removed', function(snapshot) { const el = document.getElementById('msg_wrap_' + snapshot.key); if (el) el.remove(); });
    currentRoomRef.on('child_changed', function(snapshot) {
        const msg = snapshot.val(); const msgId = snapshot.key; messagesCache[msgId] = msg; 
        const reactionsDiv = document.getElementById('reactions_' + msgId); if (reactionsDiv) { reactionsDiv.innerHTML = getReactionsHTML(msg.reactions || {}); }
        const viewsSpan = document.getElementById('views_' + msgId); if(viewsSpan) viewsSpan.textContent = msg.views || 0;
        
        const tickSpan = document.getElementById('tick_' + msgId);
        if(tickSpan) {
            if(msg.read) { tickSpan.className = 'msg-tick read'; tickSpan.textContent = '✓✓'; }
            else { tickSpan.className = 'msg-tick'; tickSpan.textContent = '✓'; }
        }

        const textDiv = document.getElementById('text_' + msgId);
        if(textDiv && msg.edited && !msg.image && !msg.audio) {
            let parsedText = msg.text.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="event.stopPropagation(); openProfileByUsername(\'$1\')">@$1</span>');
            textDiv.innerHTML = `${parsedText} <span style="font-size:10px; color:#aaa;">(изм.)</span> <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
        }
    });
}

function renderMessage(msgId, msg, roomId, myId, container, viewedMessages) {
    if(!container) return;
    const wrapper = document.createElement('div'); wrapper.className = 'message-wrapper ' + ((msg.userId === myId) ? 'sent' : 'received'); wrapper.id = 'msg_wrap_' + msgId;
    const newMessage = document.createElement('div'); newMessage.className = 'message ' + ((msg.userId === myId) ? 'sent' : 'received');
    newMessage.onclick = function(e) { showMessageActions(e, msgId, msg.userId === myId); };
    
    let replyHTML = '';
    if (msg.replyTo) replyHTML = `<div class="msg-reply-block"><span class="msg-reply-name">${msg.replyTo.name}</span><span class="msg-reply-text">${msg.replyTo.text}</span></div>`;
    const timeString = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    if (msg.userId !== myId && msg.username) {
        database.ref('users/' + msg.userId).once('value').then((uSnap) => {
            const uData = uSnap.val(); let avStyle = uData && uData.avatarUrl ? `background-image:url(${uData.avatarUrl}); color:transparent;` : ``;
            let avText = uData && uData.avatarUrl ? '' : (msg.username ? msg.username[0].toUpperCase() : '?');
            const senderInfo = document.createElement('div'); senderInfo.className = 'sender-info';
            senderInfo.onclick = function(e) { e.stopPropagation(); openProfileModal(msg.userId); };
            senderInfo.style.cursor = 'pointer';
            senderInfo.innerHTML = `<div class="sender-avatar" style="${avStyle}">${avText}</div><span class="sender-name">${msg.username}</span>`;
            wrapper.insertBefore(senderInfo, newMessage);
        });
    }
    
    const editedMark = msg.edited ? `<span style="font-size:10px; color:#aaa;">(изм.)</span>` : '';
    
    let tickHTML = '';
    if (msg.userId === myId) {
        tickHTML = msg.read ? `<span id="tick_${msgId}" class="msg-tick read">✓✓</span>` : `<span id="tick_${msgId}" class="msg-tick">✓</span>`;
    }

    if (msg.image) {
        newMessage.innerHTML = replyHTML + `<img src="${msg.image}" class="message-image" alt="Фото" onclick="event.stopPropagation(); openLightbox('${msg.image}')"><div style="text-align:right; margin-top:2px;"><span class="msg-time">${timeString}</span>${tickHTML}</div>`;
    } else if (msg.audio) {
        newMessage.innerHTML = replyHTML + `<audio controls class="audio-player" src="${msg.audio}" onclick="event.stopPropagation()"></audio><div style="text-align:right; margin-top:2px;"><span class="msg-time">${timeString}</span>${tickHTML}</div>`;
    } else {
        let parsedText = msg.text.replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention" onclick="event.stopPropagation(); openProfileByUsername(\'$1\')">@$1</span>');
        newMessage.innerHTML = replyHTML + `<div id="text_${msgId}">${parsedText} ${editedMark} <span class="msg-time">${timeString}</span>${tickHTML}</div>`;
    }
    
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

function openProfileByUsername(username) {
    database.ref('users').orderByChild('username').equalTo(username).once('value', snap => {
        if(snap.exists()) { snap.forEach(child => { openProfileModal(child.key); }); }
    });
}

function sendMessage() {
    const input = document.getElementById('msgInput'); if(!input) return;
    const text = input.value; const myId = localStorage.getItem('myUserId');
    if (text.length > 500) return alert("Максимум 500 символов.");
    if (text.trim() !== "" && myId) {
        database.ref('users/' + myId).once('value').then((snap) => {
            const myData = snap.val(); const myName = myData ? myData.displayName || myData.username : "Аноним"; const myAvatar = myData ? myData.avatarUrl : null;
            const msgData = { text: text, userId: myId, username: myName, timestamp: Date.now(), views: 0, read: false };
            if (activeReplyContext) msgData.replyTo = activeReplyContext;
            
            if (currentRoomId !== 'global' && !currentRoomId.startsWith('ch_')) {
                const otherUid = currentRoomId.split('_').find(id => id !== myId);
                database.ref(`users/${otherUid}/blocked/${myId}`).once('value').then(bSnap => {
                    if (bSnap.exists()) { alert("Пользователь заблокировал вас."); return; }
                    pushMessage();
                });
            } else { pushMessage(); }
            
            function pushMessage() {
                database.ref('chats/' + currentRoomId).push(msgData).then(() => {
                    input.value = ""; cancelReply(); input.focus(); database.ref(`typing/${currentRoomId}/${myId}`).set({ isTyping: false }); clearTimeout(typingTimeout);
                    document.getElementById('emojiPanel').style.display = 'none';
                    if (currentRoomId !== 'global') {
                        database.ref(`userChats/${myId}/${currentRoomId}`).update({ lastMessage: text });
                        if (!currentRoomId.startsWith('ch_')) {
                            const otherUid = currentRoomId.split('_').find(id => id !== myId);
                            if(otherUid) {
                                const otherChatRef = database.ref(`userChats/${otherUid}/${currentRoomId}`);
                                otherChatRef.update({ username: myName, avatarUrl: myAvatar, lastMessage: text });
                                otherChatRef.child('unreadCount').transaction((count) => (count || 0) + 1);
                            }
                        }
                    }
                });
            }
        });
    }
}

document.getElementById('msgInput').addEventListener('keypress', function (e) { 
    if (e.key === 'Enter') { 
        const popup = document.getElementById('mentionPopup');
        if(popup.style.display === 'flex') {
            const firstItem = popup.querySelector('.mention-item');
            if(firstItem) {
                firstItem.click();
                e.preventDefault();
                return;
            }
        }
        sendMessage(); 
    } 
});

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