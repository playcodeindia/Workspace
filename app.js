
        // ----------------------------------------------------------------------
        // UI & CANVAS ENGINE LOGIC
        // ----------------------------------------------------------------------
        const menuBtn = document.getElementById('menuBtn');
        const sidebar = document.getElementById('sidebar');
        const mainWrapper = document.getElementById('mainWrapper');
        
        const isMobile = () => window.innerWidth <= 1024;

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isMobile()) sidebar.classList.toggle('active');
            else { sidebar.classList.toggle('hidden'); mainWrapper.classList.toggle('expanded'); }
        });

        document.addEventListener('click', (e) => {
            if (isMobile() && sidebar.classList.contains('active')) {
                if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) sidebar.classList.remove('active');
            }
        });
        window.addEventListener('resize', () => { if (!isMobile()) { sidebar.classList.remove('active'); if(!sidebar.classList.contains('hidden')) mainWrapper.classList.remove('expanded'); } });

        const canvas = document.getElementById('bg-canvas');
        const ctx = canvas.getContext('2d');
        let width, height, particles = [];
        const CONFIG = { particleCount: window.innerWidth < 768 ? 28 : 55, connectionDistance: 160, baseColor: '255, 255, 255', lineColor: '208, 188, 255', speedMultiplier: 0.22 };
        function resize() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
        window.addEventListener('resize', () => { resize(); initParticles(); }); resize();

        class Particle {
            constructor() { this.x = Math.random() * width; this.y = Math.random() * height; this.vx = (Math.random() - 0.5) * CONFIG.speedMultiplier; this.vy = (Math.random() - 0.5) * CONFIG.speedMultiplier; this.radius = Math.random() * 1.5 + 0.5; this.color = ['208,188,255','66,133,244','185,131,255','77,208,225'][Math.floor(Math.random()*4)]; }
            update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > width) this.vx *= -1; if (this.y < 0 || this.y > height) this.vy *= -1; }
            draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(${this.color}, 0.35)`; ctx.fill(); }
        }
        function initParticles() { particles = []; for (let i = 0; i < CONFIG.particleCount; i++) particles.push(new Particle()); }
        initParticles();

        function animate() {
            ctx.clearRect(0, 0, width, height);
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x; const dy = particles[i].y - particles[j].y; const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONFIG.connectionDistance) {
                        const opacity = (1 - (dist / CONFIG.connectionDistance)) * 0.09;
                        ctx.beginPath(); ctx.strokeStyle = `rgba(${CONFIG.lineColor}, ${opacity})`; ctx.lineWidth = 1; ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke();
                    }
                }
            }
            particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);


        // ----------------------------------------------------------------------
        // FIREBASE INITIALIZATION (DB + AUTH)
        // ----------------------------------------------------------------------
        const firebaseConfig = {
            apiKey: "AIzaSyC799pLj50Sg877kdBPTIXkJPRGHr4ZC4s",
            authDomain: "playcodesetup.firebaseapp.com",
            databaseURL: "https://playcodesetup-default-rtdb.firebaseio.com",
            projectId: "playcodesetup",
            storageBucket: "playcodesetup.firebasestorage.app",
            messagingSenderId: "548277697840",
            appId: "1:548277697840:web:df6c2524d22ca93d089cf5",
            measurementId: "G-S44Y26B9F5"
        };

        firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        const auth = firebase.auth();
        const googleProvider = new firebase.auth.GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });

        let currentUser = null;
        let currentAdmin = false;
        let selectedUserId = null;
        let selectedOrderId = null;
        let currentRating = 0;
        let paymentAmount = 0;
        let transactionFilter = 'all';
        let realTimeListeners = {};
        let allUsersCache = {};
        let currentRedeemCode = '';
        let upiTimerInterval;
        let myOrdersCache = {}; 
        let currentNotifications = [];

        // ---- Admin console state ----
        let adminUsersCache = {};
        let adminOrdersCache = {};
        let adminSearchTerm = '';

        // Google Auth state
        let googleAuthInProgress = false;
        let googleAuthRestoreInProgress = false;

        const notificationIconMap = {
            info: { icon: 'info', className: 'notification-icon-info' },
            service: { icon: 'support_agent', className: 'notification-icon-service' },
            transaction: { icon: 'receipt_long', className: 'notification-icon-transaction' },
            warning: { icon: 'warning', className: 'notification-icon-warning' },
            security: { icon: 'shield', className: 'notification-icon-security' },
            promo: { icon: 'campaign', className: 'notification-icon-promo' },
            success: { icon: 'check_circle', className: 'notification-icon-success' }
        };
        
        let fsTargetAcc = null;
        let fsTargetUser = null;

        let directSignInPin = '';
        let pendingDirectUser = null;
        let currentPinKeypadMode = 'directSignIn';
        let newPinTemp = '';

        function formatINR(amount) {
            const roundedAmount = Math.round(Number(amount) || 0);
            return '₹' + roundedAmount.toLocaleString('en-IN');
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function setText(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        // ------------------------------------------------------------------
        // AVATAR HELPERS
        // ------------------------------------------------------------------
        function applyUserAvatars(user) {
            if (!user) return;
            const initial = (user.fullName || 'U').charAt(0).toUpperCase();
            const safeInitial = initial.replace(/[<>&"']/g, '');
            const photo = user.googlePhotoURL || '';

            const topAvatar = document.getElementById('userAvatar');
            if (topAvatar) {
                if (photo) {
                    const existingImg = topAvatar.querySelector('img');
                    if (existingImg && existingImg.getAttribute('src') === photo) {
                        // already correct
                    } else {
                        topAvatar.innerHTML = `<img src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer" onerror="var p=this.parentElement;this.remove();if(p)p.textContent='${safeInitial}';">`;
                    }
                } else {
                    if (topAvatar.querySelector('span#userInitial')) {
                        topAvatar.querySelector('span#userInitial').textContent = safeInitial;
                    } else {
                        topAvatar.innerHTML = `<span id="userInitial">${safeInitial}</span>`;
                    }
                }
            }

            const ddInitial = document.getElementById('dropdownInitial');
            if (ddInitial && ddInitial.parentElement) {
                const ddParent = ddInitial.parentElement;
                if (photo) {
                    const existingImg = ddParent.querySelector('img');
                    if (existingImg && existingImg.getAttribute('src') === photo) {
                        // already correct
                    } else {
                        ddParent.innerHTML = `<img src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer" onerror="var p=this.parentElement;this.remove();if(p)p.textContent='${safeInitial}';">`;
                    }
                } else {
                    if (ddParent.querySelector('span#dropdownInitial')) {
                        ddParent.querySelector('span#dropdownInitial').textContent = safeInitial;
                    } else {
                        ddParent.innerHTML = `<span id="dropdownInitial">${safeInitial}</span>`;
                    }
                }
            }
        }

        function getNotificationMeta(iconType) {
            return notificationIconMap[iconType] || notificationIconMap.info;
        }

        function showAnimatedToast(message, type = 'info', duration = 5000) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
            toast.innerHTML = `
                <span class="material-icons-round toast-icon">${icons[type]}</span>
                <div class="toast-content">
                    <div class="toast-title">${type}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="this.parentElement.remove()">×</button>
            `;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 20);
            setTimeout(() => { if (toast.parentElement) { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); } }, duration);
        }

        // ==========================================
        // GOOGLE AUTH: CORE FUNCTIONS
        // ==========================================
        function initializeFirebaseAuth() {
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .catch((error) => { console.warn('Firebase Auth persistence setup failed:', error); });

            auth.onAuthStateChanged(async function(firebaseUser) {
                if (googleAuthInProgress) return;

                const manualLogout = localStorage.getItem('playcodex_manual_logout') === '1';
                if (manualLogout) {
                    currentUser = null;
                    currentAdmin = false;
                    if (firebaseUser) {
                        try { await auth.signOut(); } catch (e) {}
                    }
                    showSignIn();
                    return;
                }

                if (!firebaseUser) {
                    showSignIn();
                    return;
                }

                if (currentUser) {
                    if (!currentUser.googleUid || currentUser.googleUid !== firebaseUser.uid) {
                        try { await auth.signOut(); } catch (e) {}
                    }
                    return;
                }

                await restoreGooglePlayCodeSession(firebaseUser);
            });
        }

        function findPlayCodeUserByGoogleUid(uid) {
            if (!uid) return Promise.resolve(null);
            return database.ref('users')
                .orderByChild('googleUid')
                .equalTo(uid)
                .once('value')
                .then(snapshot => {
                    let found = null;
                    if (snapshot.exists()) {
                        snapshot.forEach(child => {
                            if (!found) found = child.val();
                        });
                    }
                    return found;
                })
                .catch(err => {
                    console.warn('Indexed googleUid query failed, falling back to scan:', err && err.message);
                    return database.ref('users').once('value').then(snap => {
                        let found = null;
                        snap.forEach(child => {
                            const u = child.val();
                            if (u && u.googleUid === uid && !found) found = u;
                        });
                        return found;
                    });
                });
        }

        async function restoreGooglePlayCodeSession(firebaseUser) {
            if (!firebaseUser) return;
            if (googleAuthRestoreInProgress) return;
            googleAuthRestoreInProgress = true;
            try {
                const matchedUser = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (currentUser) return;
                if (!matchedUser) return;
                if (matchedUser.adminLocked) {
                    showAnimatedToast('Account is locked. Contact Admin.', 'error');
                    return;
                }
                if (matchedUser.lockedUntil && Date.now() < matchedUser.lockedUntil) {
                    const mins = Math.ceil((matchedUser.lockedUntil - Date.now()) / 60000);
                    showAnimatedToast(`Account locked. Try again in ${mins} min(s).`, 'error');
                    return;
                }
                database.ref('users/' + matchedUser.accNo).update({
                    lastLogin: new Date().toISOString(),
                    failedAttempts: 0,
                    lockCount: 0,
                    lockedUntil: null,
                    adminLocked: false
                }).catch(() => {});

                currentUser = matchedUser;
                showDashboard();
                loadUserData();
                initRealTimeListeners();
                showAnimatedToast(`Welcome back, ${matchedUser.fullName}!`, 'success');
            } catch (e) {
                console.warn('Google restore failed:', e);
                currentUser = null;
                showSignIn();
            } finally {
                googleAuthRestoreInProgress = false;
            }
        }

        function handleGoogleAuthError(error) {
            const code = (error && error.code) ? error.code : '';
            let message = 'Google sign-in failed. Please try again.';
            switch (code) {
                case 'auth/popup-closed-by-user':
                case 'auth/cancelled-popup-request':
                    message = 'Google sign-in popup was closed.';
                    break;
                case 'auth/popup-blocked':
                    message = 'Popup was blocked. Please allow popups and try again.';
                    break;
                case 'auth/account-exists-with-different-credential':
                    message = 'This email is already linked to another sign-in method.';
                    break;
                case 'auth/credential-already-in-use':
                    message = 'This Google account is already linked to another account.';
                    break;
                case 'auth/network-request-failed':
                    message = 'Network error. Check your connection and try again.';
                    break;
                case 'auth/user-cancelled':
                    message = 'Google sign-in was cancelled.';
                    break;
                case 'auth/unauthorized-domain':
                    message = 'This domain is not authorized for Google sign-in.';
                    break;
                case 'auth/operation-not-allowed':
                    message = 'Google sign-in is not enabled for this project.';
                    break;
                default:
                    console.warn('Google auth error:', error);
            }
            showAnimatedToast(message, 'error');
        }

        async function googleSignIn() {
            if (googleAuthInProgress) return;
            localStorage.removeItem('playcodex_manual_logout');
            googleAuthInProgress = true;
            const btn = document.getElementById('googleSignInBtn');
            if (btn) btn.classList.add('btn-loading');
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                const result = await auth.signInWithPopup(googleProvider);
                const firebaseUser = result && result.user;
                if (!firebaseUser) throw new Error('No Google user returned');

                const matchedUser = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (!matchedUser) {
                    pendingGoogleAccount = firebaseUser;
                    document.getElementById('googleLinkIdentityCard').innerHTML = googleIdentityCard(firebaseUser);
                    document.getElementById('linkAccountNo').value = '';
                    document.getElementById('linkSarNo').value = '';
                    showModal('googleLinkAccountModal');
                    return;
                }
                if (matchedUser.adminLocked) {
                    showAnimatedToast('Account is locked. Contact Admin.', 'error');
                    return;
                }
                if (matchedUser.lockedUntil && Date.now() < matchedUser.lockedUntil) {
                    const mins = Math.ceil((matchedUser.lockedUntil - Date.now()) / 60000);
                    showAnimatedToast(`Account locked. Try again in ${mins} min(s).`, 'error');
                    return;
                }

                database.ref('users/' + matchedUser.accNo).update({
                    lastLogin: new Date().toISOString(),
                    failedAttempts: 0,
                    lockCount: 0,
                    lockedUntil: null,
                    adminLocked: false
                }).catch(() => {});

                currentUser = matchedUser;
                currentUser.googleUid = firebaseUser.uid;
                currentUser.googleEmail = firebaseUser.email || '';
                if (!currentUser.googlePhotoURL && firebaseUser.photoURL) {
                    currentUser.googlePhotoURL = firebaseUser.photoURL;
                }

                showDashboard();
                loadUserData();
                initRealTimeListeners();
                showAnimatedToast(`Welcome back, ${matchedUser.fullName}!`, 'success');
            } catch (error) {
                handleGoogleAuthError(error);
            } finally {
                googleAuthInProgress = false;
                if (btn) btn.classList.remove('btn-loading');
            }
        }

        async function linkGoogleAccount() {
            if (!currentUser) {
                showAnimatedToast('Please sign in to your PlayCode account first.', 'warning');
                return;
            }
            if (currentUser.googleUid) {
                showAnimatedToast('A Google account is already linked.', 'info');
                return;
            }
            if (googleAuthInProgress) return;
            googleAuthInProgress = true;
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                const result = await auth.signInWithPopup(googleProvider);
                const firebaseUser = result && result.user;
                if (!firebaseUser) throw new Error('No Google user returned');

                const existingUser = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (existingUser && existingUser.accNo !== currentUser.accNo) {
                    showAnimatedToast('This Google account is already linked to another PlayCode account.', 'error');
                    try { await auth.signOut(); } catch (e) {}
                    return;
                }

                await database.ref('users/' + currentUser.accNo).update({
                    googleUid: firebaseUser.uid,
                    googleEmail: firebaseUser.email || '',
                    googleDisplayName: firebaseUser.displayName || '',
                    googlePhotoURL: firebaseUser.photoURL || '',
                    googleLinkedAt: new Date().toISOString()
                });

                currentUser.googleUid = firebaseUser.uid;
                currentUser.googleEmail = firebaseUser.email || '';
                currentUser.googleDisplayName = firebaseUser.displayName || '';
                currentUser.googlePhotoURL = firebaseUser.photoURL || '';
                currentUser.googleLinkedAt = new Date().toISOString();

                refreshGoogleStatusUI();
                showAnimatedToast('Google account linked successfully!', 'success');
            } catch (error) {
                handleGoogleAuthError(error);
            } finally {
                googleAuthInProgress = false;
            }
        }

        function showManageGoogleModal() {
            if (!currentUser || !currentUser.googleUid) return;
            document.getElementById('manageGoogleEmail').textContent = currentUser.googleEmail || 'Linked';
            const linkedAtEl = document.getElementById('manageGoogleLinkedAt');
            if (linkedAtEl) {
                linkedAtEl.textContent = currentUser.googleLinkedAt
                    ? 'Linked on ' + new Date(currentUser.googleLinkedAt).toLocaleString()
                    : '';
            }
            showModal('manageGoogleModal');
        }

        async function unlinkGoogleAccount() {
            if (!currentUser) return;
            if (!currentUser.googleUid) {
                showAnimatedToast('No Google account is linked.', 'warning');
                return;
            }
            if (!confirm('Unlink Google account from this PlayCode account?')) return;

            try {
                await database.ref('users/' + currentUser.accNo).update({
                    googleUid: null,
                    googleEmail: null,
                    googleDisplayName: null,
                    googlePhotoURL: null,
                    googleLinkedAt: null
                });

                delete currentUser.googleUid;
                delete currentUser.googleEmail;
                delete currentUser.googleDisplayName;
                delete currentUser.googlePhotoURL;
                delete currentUser.googleLinkedAt;

                try {
                    if (auth.currentUser) {
                        await auth.signOut();
                    }
                } catch (e) {}

                closeModal('manageGoogleModal');
                refreshGoogleStatusUI();
                showAnimatedToast('Google account unlinked.', 'success');
            } catch (e) {
                showAnimatedToast('Failed to unlink: ' + e.message, 'error');
            }
        }

        function reconcileFirebaseAuthWithUser(user) {
            try {
                const fbUser = auth.currentUser;
                if (!fbUser) return;
                if (!user) return;
                if (!user.googleUid || fbUser.uid !== user.googleUid) {
                    auth.signOut().catch(() => {});
                }
            } catch (e) {}
        }

        function refreshGoogleStatusUI() {
            const container = document.getElementById('googleLinkSection');
            if (!container) return;
            if (!currentUser) { container.innerHTML = ''; return; }

            applyUserAvatars(currentUser);

            if (currentUser.googleUid) {
                const email = escapeHtml(currentUser.googleEmail || 'Linked');
                container.innerHTML = `
                    <div class="dropdown-item" onclick="showManageGoogleModal(); toggleUserMenu();">
                        <span class="material-icons-round" style="color: #6DD58C;">verified</span>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 13px; font-weight: 600; color: #6DD58C;">Google Account Linked</div>
                            <div style="font-size: 11px; color: var(--md-sys-color-on-surface-variant); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${email}</div>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="dropdown-item" onclick="linkGoogleAccount(); toggleUserMenu();">
                        <span class="material-icons-round" style="color: var(--md-sys-color-primary);">link</span>
                        <span>Link Google Account</span>
                    </div>
                `;
            }
        }

        // ==========================================
        // GOOGLE ACCOUNT LINK / CREATE FLOWS
        // ==========================================
        let pendingGoogleAccount = null;

        function googleIdentityCard(firebaseUser) {
            const photo = firebaseUser.photoURL ? `<img src="${escapeHtml(firebaseUser.photoURL)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;">` : `<div class="user-avatar-small" style="width:52px;height:52px;">${escapeHtml((firebaseUser.displayName || firebaseUser.email || 'G').charAt(0).toUpperCase())}</div>`;
            return `${photo}<div style="min-width:0;flex:1;"><div style="font-weight:700;color:var(--md-sys-color-on-surface);">${escapeHtml(firebaseUser.displayName || 'Google User')}</div><div class="text-xs text-muted">${escapeHtml(firebaseUser.email || '')}</div><div class="text-xs text-muted" style="word-break:break-all;">UID: ${escapeHtml(firebaseUser.uid)}</div></div>`;
        }

        async function startGoogleAccountLinkFromSignIn() {
            if (googleAuthInProgress) return;
            localStorage.removeItem('playcodex_manual_logout');
            googleAuthInProgress = true;
            const btn = document.getElementById('linkGoogleFromSignInBtn');
            if (btn) btn.classList.add('btn-loading');
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                const result = await auth.signInWithPopup(googleProvider);
                const firebaseUser = result && result.user;
                if (!firebaseUser) throw new Error('No Google user returned');
                pendingGoogleAccount = firebaseUser;
                document.getElementById('googleLinkIdentityCard').innerHTML = googleIdentityCard(firebaseUser);
                document.getElementById('linkAccountNo').value = '';
                document.getElementById('linkSarNo').value = '';
                showModal('googleLinkAccountModal');
            } catch (error) { handleGoogleAuthError(error); }
            finally { googleAuthInProgress = false; if (btn) btn.classList.remove('btn-loading'); }
        }

        async function completeGoogleAccountLink() {
            const firebaseUser = pendingGoogleAccount || auth.currentUser;
            const accNo = document.getElementById('linkAccountNo').value.trim();
            const sarNo = document.getElementById('linkSarNo').value.trim();
            if (!firebaseUser) return showAnimatedToast('Google verification expired. Start again.', 'error');
            if (!accNo || !sarNo) return showAnimatedToast('Enter Account Number and SAR Number.', 'error');
            try {
                const existingGoogleLink = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (existingGoogleLink && existingGoogleLink.accNo !== accNo) {
                    return showAnimatedToast('This Google account is already linked to another account.', 'error');
                }
                const snap = await database.ref('users/' + accNo).once('value');
                if (!snap.exists()) return showAnimatedToast('Account Number not found.', 'error');
                const user = snap.val();
                if (String(user.sarNo || '') !== sarNo) return showAnimatedToast('SAR Number does not match.', 'error');
                if (user.googleUid && user.googleUid !== firebaseUser.uid) return showAnimatedToast('This PlaycodeX account is already linked to another Google account.', 'error');

                await database.ref('users/' + accNo).update({
                    googleUid: firebaseUser.uid,
                    googleEmail: firebaseUser.email || '',
                    googleDisplayName: firebaseUser.displayName || '',
                    googlePhotoURL: firebaseUser.photoURL || '',
                    googleLinkedAt: new Date().toISOString()
                });
                pendingGoogleAccount = null;
                closeModal('googleLinkAccountModal');
                showAnimatedToast('Google account linked successfully. You can now use Continue with Google.', 'success');
                await auth.signOut().catch(() => {});
            } catch (error) { showAnimatedToast(error.message || 'Failed to link account.', 'error'); }
        }

        function cancelGoogleLinkFlow() {
            closeModal('googleLinkAccountModal');
            pendingGoogleAccount = null;
            if (auth.currentUser) auth.signOut().catch(() => {});
        }

        async function generateAvailableGoogleAccountNo() {
            for (let attempt = 0; attempt < 30; attempt++) {
                const candidate = '2362' + String(Math.floor(100000 + Math.random() * 900000));
                const snap = await database.ref('users/' + candidate).once('value');
                if (!snap.exists()) return candidate;
            }
            throw new Error('Could not generate an available Account Number. Try again.');
        }

        async function startGoogleAccountCreation() {
            if (googleAuthInProgress) return;
            localStorage.removeItem('playcodex_manual_logout');
            googleAuthInProgress = true;
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                const result = await auth.signInWithPopup(googleProvider);
                const firebaseUser = result && result.user;
                if (!firebaseUser) throw new Error('No Google user returned');
                const alreadyLinked = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (alreadyLinked) {
                    showAnimatedToast('This Google account already has a PlaycodeX account. Use Continue with Google.', 'info');
                    await auth.signOut().catch(() => {});
                    return;
                }
                pendingGoogleAccount = firebaseUser;
                document.getElementById('googleCreateIdentityCard').innerHTML = googleIdentityCard(firebaseUser);
                document.getElementById('googleCreateSarNo').value = '';
                document.getElementById('googleCreatePin').value = '';
                document.getElementById('googleCreateAgentCode').value = '';
                document.getElementById('generatedGoogleAccNo').value = 'Generating...';
                showModal('googleCreateAccountModal');
                document.getElementById('generatedGoogleAccNo').value = await generateAvailableGoogleAccountNo();
            } catch (error) { handleGoogleAuthError(error); }
            finally { googleAuthInProgress = false; }
        }

        async function completeGoogleAccountCreation() {
            const firebaseUser = pendingGoogleAccount || auth.currentUser;
            const accNo = document.getElementById('generatedGoogleAccNo').value.trim();
            const sarNo = document.getElementById('googleCreateSarNo').value.trim();
            const pin = document.getElementById('googleCreatePin').value.trim();
            const agentCode = document.getElementById('googleCreateAgentCode').value;
            if (!firebaseUser) return showAnimatedToast('Google verification expired. Start again.', 'error');
            if (!/^2362\d{6}$/.test(accNo)) return showAnimatedToast('Invalid generated Account Number.', 'error');
            if (!sarNo) return showAnimatedToast('Create a SAR Number.', 'error');
            if (!/^\d{4}$/.test(pin)) return showAnimatedToast('Create a valid 4-digit PIN.', 'error');
            if (!agentCode) return showAnimatedToast('Select your agent.', 'error');
            try {
                const existing = await database.ref('users/' + accNo).once('value');
                if (existing.exists()) {
                    document.getElementById('generatedGoogleAccNo').value = await generateAvailableGoogleAccountNo();
                    return showAnimatedToast('Account number was already taken. A new one was generated.', 'warning');
                }
                const userData = {
                    accNo, sarNo, fullName: firebaseUser.displayName || 'PlaycodeX User', agentCode, pin,
                    balance: 0, createdAt: new Date().toISOString(),
                    googleUid: firebaseUser.uid, googleEmail: firebaseUser.email || '',
                    googleDisplayName: firebaseUser.displayName || '', googlePhotoURL: firebaseUser.photoURL || '',
                    googleLinkedAt: new Date().toISOString(), role: 'user'
                };
                await database.ref('users/' + accNo).set(userData);
                const transactionId = 'TX' + Date.now();
                await database.ref('transactions/' + transactionId).set({ transactionId, accNo, type:'account_creation', amount:0, description:'Created with Google', date:new Date().toISOString(), balanceAfter:0 });
                pendingGoogleAccount = null;
                currentUser = userData;
                closeModal('googleCreateAccountModal');
                showDashboard(); loadUserData(); initRealTimeListeners();
                showAnimatedToast(`Account created successfully: ${accNo}`, 'success');
            } catch (error) { showAnimatedToast(error.message || 'Account creation failed.', 'error'); }
        }

        function cancelGoogleCreateFlow() {
            closeModal('googleCreateAccountModal');
            pendingGoogleAccount = null;
            if (auth.currentUser) auth.signOut().catch(() => {});
        }

        // ==========================================
        // FORGOT SAR LOGIC
        // ==========================================
        function startForgotSarFlow() { showAnimatedToast('SAR recovery now requires Google account access.', 'info'); }

        function fsVerifyUser() {
            const accNo = document.getElementById('fsAccountNo').value.trim();
            const fullName = document.getElementById('fsFullName').value.trim();
            
            if(!accNo || !fullName) return showAnimatedToast('Please enter both details', 'error');
            
            const btn = document.getElementById('fsVerifyUserBtn');
            btn.classList.add('btn-loading');

            database.ref('users/' + accNo).once('value').then(snapshot => {
                if(snapshot.exists()) {
                    const user = snapshot.val();
                    if(user.fullName.toLowerCase() === fullName.toLowerCase()) {
                        fsTargetAcc = accNo;
                        fsTargetUser = user;
                        document.getElementById('fsUserNameDisplay').innerText = `Hi ${user.fullName.split(' ')[0]}, please enter your PIN.`;
                        document.getElementById('fsStep1').style.display = 'none';
                        document.getElementById('fsStep2').style.display = 'block';
                    } else {
                        showAnimatedToast('Name does not match our records.', 'error');
                    }
                } else {
                    showAnimatedToast('Account not found.', 'error');
                }
            }).catch(e => showAnimatedToast(e.message, 'error')).finally(() => btn.classList.remove('btn-loading'));
        }

        function fsVerifyPin() {
            const pin = document.getElementById('fsPin').value;
            if(!pin || pin.length !== 4) return showAnimatedToast('Enter valid 4-digit PIN', 'error');
            
            if(fsTargetUser && fsTargetUser.pin === pin) {
                document.getElementById('fsStep2').style.display = 'none';
                document.getElementById('fsStep3').style.display = 'block';
            } else {
                showAnimatedToast('Incorrect PIN', 'error');
            }
        }

        function fsUpdateSar() {
            const newSar = document.getElementById('fsNewSar').value.trim();
            const confirmSar = document.getElementById('fsConfirmSar').value.trim();
            
            if(!newSar || !confirmSar) return showAnimatedToast('Enter new SAR details', 'error');
            if(newSar !== confirmSar) return showAnimatedToast('SAR numbers do not match', 'error');
            
            const btn = document.getElementById('fsUpdateBtn');
            btn.classList.add('btn-loading');

            database.ref('users/' + fsTargetAcc).update({ sarNo: newSar }).then(() => {
                showAnimatedToast('SAR Number updated successfully!', 'success');
                closeModal('forgotSarModal');
            }).catch(e => showAnimatedToast(e.message, 'error')).finally(() => btn.classList.remove('btn-loading'));
        }

        // ==========================================
        // AUTHENTICATION & LOGIN ATTEMPT LIMITER
        // ==========================================
        function showDirectSignInModal() { showAnimatedToast('Direct Sign-In has been retired. Please use Google Sign-In.', 'info'); }

        function processDirectSignIn() { showAnimatedToast('Direct Sign-In has been retired. Please use Google Sign-In.', 'info'); }

        function startChangePinFlow() {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.remove('show');

            currentPinKeypadMode = 'changePinOld';
            directSignInPin = '';
            document.getElementById('pinKeypadTitle').innerText = "Enter Current PIN";
            document.getElementById('pinKeypadSubtitle').innerHTML = "To change your PIN, first verify your old PIN.";
            document.querySelector('#pinVerificationModal .verify').innerText = "Next";
            updatePinDisplay();
            showModal('pinVerificationModal');
        }

        function addPinDigit(digit) {
            if(directSignInPin.length < 4) {
                directSignInPin += digit;
                updatePinDisplay();
            }
        }
        function removePinDigit() {
            if(directSignInPin.length > 0) {
                directSignInPin = directSignInPin.slice(0, -1);
                updatePinDisplay();
            }
        }
        function updatePinDisplay() {
            const dots = document.querySelectorAll('#pinDisplay .pin-dot');
            dots.forEach((dot, index) => {
                if(index < directSignInPin.length) { dot.classList.add('filled'); } 
                else { dot.classList.remove('filled'); }
            });
        }
        
        function handlePinSubmit() {
            if(directSignInPin.length !== 4) return showAnimatedToast('Enter 4 digit PIN', 'warning');

            if (currentPinKeypadMode === 'directSignIn') {
                if(pendingDirectUser && pendingDirectUser.pin === directSignInPin) {
                    closeModal('pinVerificationModal');
                    
                    database.ref('users/' + pendingDirectUser.accNo).update({ 
                        lastLogin: new Date().toISOString(),
                        failedAttempts: 0,
                        lockCount: 0,
                        lockedUntil: null,
                        adminLocked: false
                    });
                    
                    currentUser = pendingDirectUser;
                    pendingDirectUser = null;
                    showDashboard(); loadUserData(); initRealTimeListeners();
                    reconcileFirebaseAuthWithUser(currentUser);
                    showAnimatedToast(`Verified! Welcome back, ${currentUser.fullName}!`, 'success');
                } else {
                    let failedAttempts = (pendingDirectUser.failedAttempts || 0) + 1;
                    pendingDirectUser.failedAttempts = failedAttempts;

                    if (failedAttempts >= 3) {
                        database.ref('users/' + pendingDirectUser.accNo).update({
                            failedAttempts: failedAttempts,
                            adminLocked: true
                        });
                        closeModal('pinVerificationModal');
                        showAnimatedToast('Account permanently locked due to 3 failed attempts. Contact Admin.', 'error');
                        pendingDirectUser = null;
                    } else {
                        database.ref('users/' + pendingDirectUser.accNo).update({
                            failedAttempts: failedAttempts
                        });
                        showAnimatedToast(`Incorrect PIN! ${3 - failedAttempts} attempt(s) left.`, 'error');
                        directSignInPin = '';
                        updatePinDisplay();
                    }
                }
            } else if (currentPinKeypadMode === 'changePinOld') {
                if(directSignInPin === currentUser.pin) {
                    currentPinKeypadMode = 'changePinNew';
                    directSignInPin = '';
                    document.getElementById('pinKeypadTitle').innerText = "Enter New PIN";
                    document.getElementById('pinKeypadSubtitle').innerHTML = "Enter a new 4-digit PIN.";
                    updatePinDisplay();
                } else {
                    showAnimatedToast('Incorrect current PIN', 'error');
                    directSignInPin = '';
                    updatePinDisplay();
                }
            } else if (currentPinKeypadMode === 'changePinNew') {
                newPinTemp = directSignInPin;
                currentPinKeypadMode = 'changePinConfirm';
                directSignInPin = '';
                document.getElementById('pinKeypadTitle').innerText = "Confirm New PIN";
                document.getElementById('pinKeypadSubtitle').innerHTML = "Re-enter your new PIN to confirm.";
                document.querySelector('#pinVerificationModal .verify').innerText = "Confirm";
                updatePinDisplay();
            } else if (currentPinKeypadMode === 'changePinConfirm') {
                if(directSignInPin === newPinTemp) {
                    database.ref('users/' + currentUser.accNo).update({ pin: newPinTemp }).then(() => {
                        currentUser.pin = newPinTemp;
                        closeModal('pinVerificationModal');
                        showAnimatedToast('PIN changed successfully', 'success');
                    }).catch(e => showAnimatedToast(e.message, 'error'));
                } else {
                    showAnimatedToast('PINs do not match. Try again.', 'error');
                    currentPinKeypadMode = 'changePinNew';
                    directSignInPin = '';
                    document.getElementById('pinKeypadTitle').innerText = "Enter New PIN";
                    document.getElementById('pinKeypadSubtitle').innerHTML = "Enter a new 4-digit PIN.";
                    document.querySelector('#pinVerificationModal .verify').innerText = "Next";
                    updatePinDisplay();
                }
            }
        }

        function startSignInSequence() { showAnimatedToast('Manual Account Number + SAR sign-in has been retired. Please use Google Sign-In.', 'info'); }

        function startSignUpSequence() {
            const accNo = document.getElementById('accNo').value.trim();
            const sarNo = document.getElementById('sarNo').value.trim();
            const fullName = document.getElementById('fullName').value.trim();
            const agentCode = document.getElementById('agentCode').value;
            const pin = document.getElementById('pin').value;
            
            if (!accNo || !sarNo || !fullName || !agentCode || !pin || pin.length !== 4) return showAnimatedToast('Fill all fields correctly', 'error');
            
            const btn = document.getElementById('signupBtn'); 
            btn.classList.add('btn-loading');
            
            database.ref('users/' + accNo).once('value').then(snapshot => {
                if (snapshot.exists()) { showAnimatedToast('Account already exists!', 'error'); btn.classList.remove('btn-loading'); } 
                else {
                    const userData = { accNo, sarNo, fullName, agentCode, pin, balance: 0, createdAt: new Date().toISOString() };
                    database.ref('users/' + accNo).set(userData).then(() => {
                        const transactionId = 'TX' + Date.now();
                        return database.ref('transactions/' + transactionId).set({ transactionId, accNo, type: 'account_creation', amount: 0, description: 'Created', date: new Date().toISOString(), balanceAfter: 0 });
                    }).then(() => { 
                        showAnimatedToast('Account Created successfully!', 'success'); showSignIn(); clearSignUpForm(); 
                    }).finally(() => btn.classList.remove('btn-loading'));
                }
            }).catch(e => { showAnimatedToast(e.message, 'error'); btn.classList.remove('btn-loading'); });
        }

        function showSignUp() { startGoogleAccountCreation(); }
        function showSignIn() {
            const signup = document.getElementById('signupPage');
            const signin = document.getElementById('signinPage');
            const dashboard = document.getElementById('dashboard');
            const adminPanel = document.getElementById('adminPanel');
            if (signup) signup.style.display = 'none';
            if (dashboard) dashboard.style.display = 'none';
            if (adminPanel) adminPanel.style.display = 'none';
            if (signin) signin.style.display = 'flex';
            document.body.style.overflow = '';
            window.scrollTo(0, 0);
        }
        function clearSignUpForm() { ['accNo', 'sarNo', 'fullName', 'agentCode', 'pin'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; }); }
        function clearSignInForm() {
            ['loginAccNo', 'loginSar'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        }
        
        function showDashboard() {
            const signin = document.getElementById('signinPage');
            const signup = document.getElementById('signupPage');
            const dashboard = document.getElementById('dashboard');
            const adminPanel = document.getElementById('adminPanel');
            if (!dashboard) throw new Error('Dashboard container is missing.');
            if (signin) signin.style.display = 'none';
            if (signup) signup.style.display = 'none';
            if (adminPanel) adminPanel.style.display = 'none';
            dashboard.style.display = 'flex';
            const orders = document.getElementById('myOrdersSection');
            const history = document.getElementById('transactionHistorySection');
            const manage = document.getElementById('manageAccount');
            if (orders) orders.style.display = 'none';
            if (history) history.style.display = 'none';
            if (manage) manage.style.display = 'block';
            document.body.style.overflow = '';
            try { loadUserNotifications(false); } catch (e) { console.warn('Notification init failed:', e); }
            try { refreshGoogleStatusUI(); } catch (e) { console.warn('Google UI refresh failed:', e); }
            window.scrollTo(0, 0);
        }
        function toggleUserMenu() { document.getElementById('userDropdown').classList.toggle('show'); }
        function showManageAccount() { document.getElementById('myOrdersSection').style.display = 'none'; document.getElementById('transactionHistorySection').style.display = 'none'; document.getElementById('manageAccount').style.display = 'block'; loadUserNotifications(false); toggleUserMenu(); }
        function showMyOrders() { document.getElementById('manageAccount').style.display = 'none'; document.getElementById('transactionHistorySection').style.display = 'none'; document.getElementById('myOrdersSection').style.display = 'block'; loadUserOrders(); toggleUserMenu(); }
        function showTransactionHistory() { document.getElementById('manageAccount').style.display = 'none'; document.getElementById('myOrdersSection').style.display = 'none'; document.getElementById('transactionHistorySection').style.display = 'block'; loadTransactionHistory(); toggleUserMenu(); }
        
        function loadUserData() { 
            if (currentUser) { 
                const firstName = currentUser.fullName.split(' ')[0];
                document.getElementById('welcomeTitle').textContent = `Welcome, ${firstName}`; 
                document.getElementById('welcomeBalanceDisplay').textContent = formatINR(currentUser.balance); 
                document.getElementById('dropdownName').textContent = currentUser.fullName; 
                document.getElementById('dropdownId').textContent = currentUser.accNo; 
                document.getElementById('dropdownBalance').textContent = formatINR(currentUser.balance);
                applyUserAvatars(currentUser);
                refreshGoogleStatusUI();
            } 
        }
        function updateBalanceDisplay() { if (currentUser) { const formattedBalance = formatINR(currentUser.balance); document.getElementById('welcomeBalanceDisplay').textContent = formattedBalance; document.getElementById('dropdownBalance').textContent = formattedBalance; updateTransferSummary(); } }

        function initRealTimeListeners() {
            if (!currentUser) return;
            Object.keys(realTimeListeners).forEach(key => { if (realTimeListeners[key]) realTimeListeners[key](); });
            realTimeListeners.balance = database.ref('users/' + currentUser.accNo + '/balance').on('value', (snapshot) => {
                if (snapshot.exists() && currentUser) { const newBalance = snapshot.val(); if (newBalance !== currentUser.balance) { currentUser.balance = newBalance; updateBalanceDisplay(); } }
            });
        }

        async function executeSignOut(event) {
            if (event) event.stopPropagation();
            localStorage.setItem('playcodex_manual_logout', '1');
            try {
                if (realTimeListeners) {
                    Object.keys(realTimeListeners).forEach(key => {
                        if (typeof realTimeListeners[key] === 'function') realTimeListeners[key]();
                    });
                    realTimeListeners = {};
                }
                try { await auth.signOut(); } catch (e) {}
                currentUser = null;
                currentAdmin = false;
                allUsersCache = {};
                myOrdersCache = {};
                const dropdown = document.getElementById('userDropdown');
                if (dropdown) dropdown.classList.remove('show');
                const gs = document.getElementById('googleLinkSection');
                if (gs) gs.innerHTML = '';
                const topAvatar = document.getElementById('userAvatar');
                if (topAvatar) topAvatar.innerHTML = '<span id="userInitial">U</span>';
                ['dashboard', 'adminPanel', 'manageAccount', 'myOrdersSection', 'transactionHistorySection'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                showSignIn();
                clearSignInForm();
                showAnimatedToast('Signed out securely. Continue with Google to sign in again.', 'success');
            } catch (error) {
                currentUser = null;
                showSignIn();
            }
        }

        function checkBalance() { showModal('balanceModal'); document.getElementById('balanceLoading').style.display = 'flex'; document.getElementById('balanceResult').style.display = 'none'; setTimeout(() => { document.getElementById('balanceLoading').style.display = 'none'; document.getElementById('balanceResult').style.display = 'block'; document.getElementById('balanceAmount').textContent = formatINR(currentUser.balance); }, 3000); }
        
        function addBalance() { document.getElementById('addAmount').value = ''; showModal('addBalanceModal'); }
        function toggleNotificationsPanel(event) {
            if (event) event.stopPropagation();
            const panel = document.getElementById('notificationPanel');
            if (!panel) return;
            const isOpen = panel.classList.contains('show');
            if (isOpen) { closeNotificationsPanel(); return; }
            loadUserNotifications(true);
            panel.classList.add('show');
            panel.setAttribute('aria-hidden', 'false');
        }

        function closeNotificationsPanel(event) {
            if (event) event.stopPropagation();
            const panel = document.getElementById('notificationPanel');
            if (!panel) return;
            panel.classList.remove('show');
            panel.setAttribute('aria-hidden', 'true');
        }

        function renderUserNotifications(notifications) {
            const panelBody = document.getElementById('notificationPanelBody');
            const badge = document.getElementById('notificationBadge');
            if (!panelBody || !badge) return;

            currentNotifications = notifications;
            const unreadCount = notifications.filter(notification => !notification.read).length;
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';

            if (!notifications.length) {
                panelBody.innerHTML = `
                    <div class="notification-empty-state">
                        <span class="material-icons-round">notifications_off</span>
                        <h3>No notifications yet</h3>
                        <p>New alerts from admin will appear here.</p>
                    </div>
                `;
                return;
            }

            panelBody.innerHTML = notifications.map(notification => {
                const meta = getNotificationMeta(notification.iconType);
                const title = escapeHtml(notification.title || 'Notification');
                const message = escapeHtml(notification.message || '');
                const createdAt = notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Just now';
                const sender = escapeHtml(notification.senderLabel || 'Admin');
                return `
                    <div class="notification-item ${notification.read ? '' : 'unread'}">
                        <div class="notification-item-icon ${meta.className}">
                            <span class="material-icons-round">${meta.icon}</span>
                        </div>
                        <div class="notification-item-content">
                            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                                <div class="notification-item-title" style="margin-bottom:0;">${title}</div>
                                <div class="notification-item-actions">
                                    <button class="notification-item-close" type="button" aria-label="Remove notification" onclick="removeNotification('${notification.id}', event)">
                                        <span class="material-icons-round">close</span>
                                    </button>
                                </div>
                            </div>
                            <div class="notification-item-message">${message}</div>
                            <div class="notification-item-meta">
                                <span>${sender}</span>
                                <span>${createdAt}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function loadUserNotifications(markAsRead = false) {
            if (!currentUser) return;
            database.ref('userNotifications/' + currentUser.accNo).once('value').then(snapshot => {
                const notifications = [];
                snapshot.forEach(childSnapshot => {
                    const notification = childSnapshot.val();
                    notifications.push({ id: childSnapshot.key, ...notification });
                });
                notifications.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
                renderUserNotifications(notifications);

                const unreadUpdates = {};
                if (markAsRead) {
                    notifications.forEach(notification => {
                        if (!notification.read) unreadUpdates[`userNotifications/${currentUser.accNo}/${notification.id}/read`] = true;
                    });
                }
                if (Object.keys(unreadUpdates).length) {
                    database.ref().update(unreadUpdates).catch(() => {});
                }
            }).catch(() => {
                renderUserNotifications([]);
            });
        }

        function removeNotification(notificationId, event) {
            if (event) event.stopPropagation();
            if (!currentUser || !notificationId) return;
            database.ref(`userNotifications/${currentUser.accNo}/${notificationId}`).remove().then(() => {
                loadUserNotifications(false);
            }).catch(e => showAnimatedToast(e.message, 'error'));
        }

        function clearAllNotifications(event) {
            if (event) event.stopPropagation();
            if (!currentUser) return;
            if (!confirm('Clear all notifications?')) return;
            database.ref(`userNotifications/${currentUser.accNo}`).remove().then(() => {
                renderUserNotifications([]);
                showAnimatedToast('Notifications cleared', 'success');
            }).catch(e => showAnimatedToast(e.message, 'error'));
        }

        function refreshPushNotificationUsers() {
            const userSelect = document.getElementById('pushNotificationUser');
            if (!userSelect) return;
            const users = Object.values(allUsersCache).sort((left, right) => (left.fullName || '').localeCompare(right.fullName || ''));
            userSelect.innerHTML = users.length ? users.map(user => `<option value="${escapeHtml(user.accNo)}">${escapeHtml(user.fullName)} (${escapeHtml(user.accNo)})</option>`).join('') : '<option value="">No users available</option>';
        }

        function togglePushNotificationUserPicker() {
            const audience = document.getElementById('pushNotificationAudience').value;
            const userPicker = document.getElementById('pushNotificationUserPicker');
            if (!userPicker) return;
            userPicker.classList.toggle('show', audience === 'single');
        }

        function showPushNotificationModal() {
            document.getElementById('pushNotificationTitle').value = '';
            document.getElementById('pushNotificationMessage').value = '';
            document.getElementById('pushNotificationIcon').value = 'info';
            document.getElementById('pushNotificationAudience').value = 'all';
            togglePushNotificationUserPicker();
            if (!Object.keys(allUsersCache).length) {
                database.ref('users').once('value').then(snapshot => {
                    snapshot.forEach(childSnapshot => {
                        const user = childSnapshot.val();
                        if (user && user.accNo) allUsersCache[user.accNo] = user;
                    });
                    refreshPushNotificationUsers();
                    showModal('adminPushNotificationModal');
                }).catch(() => {
                    refreshPushNotificationUsers();
                    showModal('adminPushNotificationModal');
                });
                return;
            }
            refreshPushNotificationUsers();
            showModal('adminPushNotificationModal');
        }

        function sendPushNotification() {
            const title = document.getElementById('pushNotificationTitle').value.trim();
            const message = document.getElementById('pushNotificationMessage').value.trim();
            const iconType = document.getElementById('pushNotificationIcon').value;
            const audience = document.getElementById('pushNotificationAudience').value;
            const selectedUser = document.getElementById('pushNotificationUser').value;

            if (!title || !message) return showAnimatedToast('Add a title and message', 'error');
            if (audience === 'single' && !selectedUser) return showAnimatedToast('Select a user', 'error');

            const notificationId = 'NTF' + Date.now();
            const baseNotification = { id: notificationId, title, message, iconType, createdAt: new Date().toISOString(), senderLabel: 'Admin', read: false, audience };

            const writeNotification = (userIds) => {
                const updates = {};
                userIds.forEach(accNo => { updates[`userNotifications/${accNo}/${notificationId}`] = { ...baseNotification, targetAccNo: accNo }; });
                return database.ref().update(updates);
            };

            if (audience === 'single') {
                writeNotification([selectedUser]).then(() => { closeModal('adminPushNotificationModal'); showAnimatedToast('Notification sent to user', 'success'); }).catch(e => showAnimatedToast(e.message, 'error'));
                return;
            }

            database.ref('users').once('value').then(snapshot => {
                const userIds = [];
                snapshot.forEach(childSnapshot => { const user = childSnapshot.val(); if (user && user.accNo) userIds.push(user.accNo); });
                if (!userIds.length) throw new Error('No users found');
                return writeNotification(userIds);
            }).then(() => { closeModal('adminPushNotificationModal'); showAnimatedToast('Notification sent to all users', 'success'); }).catch(e => showAnimatedToast(e.message, 'error'));
        }

        function proceedToPaymentMethod() { const amount = parseFloat(document.getElementById('addAmount').value); if (!amount || amount < 10) return showAnimatedToast('Min deposit is ₹10', 'error'); paymentAmount = amount; document.getElementById('methodAmountDisplay').textContent = formatINR(amount); closeModal('addBalanceModal'); showModal('paymentMethodModal'); }

        function openUPIPayment() { closeModal('paymentMethodModal'); const upiString = encodeURIComponent(`upi://pay?pa=9301876096@fam&pn=Playcode Agent&am=${paymentAmount}`); document.getElementById('upiQrImage').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${upiString}`; document.getElementById('upiAmountText').innerText = formatINR(paymentAmount); document.getElementById('upiFinalAmountDisplay').innerText = formatINR(paymentAmount); document.getElementById('upiQrSection').style.display = 'block'; document.getElementById('upiFormSection').style.display = 'none'; document.getElementById('upiFooterSection').style.display = 'none'; document.getElementById('userUpiId').value = ''; document.getElementById('userUtrId').value = ''; showModal('upiPaymentModal'); let timeLeft = 60; document.getElementById('upiTimerDisplay').innerText = `60s`; clearInterval(upiTimerInterval); upiTimerInterval = setInterval(() => { timeLeft--; document.getElementById('upiTimerDisplay').innerText = `${timeLeft}s`; if (timeLeft <= 0) { clearInterval(upiTimerInterval); document.getElementById('upiQrSection').style.display = 'none'; document.getElementById('upiFormSection').style.display = 'block'; document.getElementById('upiFooterSection').style.display = 'flex'; } }, 1000); }
        function openUPIAppPayment() { closeModal('paymentMethodModal'); showModal('upiAppSelectionModal'); }
        function openSpecificUPIApp(app) { const upiId = '9301876096@fam'; const name = 'Playcode Agent'; const amount = paymentAmount; let uri = ''; if (app === 'gpay') { uri = `tez://upi/pay?pa=${upiId}&pn=${name}&am=${amount}`; } else if (app === 'phonepe') { uri = `phonepe://pay?pa=${upiId}&pn=${name}&am=${amount}`; } else { uri = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}`; } window.location.href = uri; closeModal('upiAppSelectionModal'); document.getElementById('upiAmountText').innerText = formatINR(paymentAmount); document.getElementById('upiFinalAmountDisplay').innerText = formatINR(paymentAmount); document.getElementById('upiQrSection').style.display = 'none'; document.getElementById('upiFormSection').style.display = 'block'; document.getElementById('upiFooterSection').style.display = 'flex'; clearInterval(upiTimerInterval); showModal('upiPaymentModal'); }
        function submitUPIPayment() { const upiId = document.getElementById('userUpiId').value.trim(); const utrId = document.getElementById('userUtrId').value.trim(); if(!upiId || !utrId) return showAnimatedToast('Please enter both UPI ID and UTR', 'error'); const newBalance = (currentUser.balance || 0) + paymentAmount; const transactionId = 'TX' + Date.now(); const updates = {}; updates[`users/${currentUser.accNo}/balance`] = newBalance; updates[`transactions/${transactionId}`] = { transactionId, accNo: currentUser.accNo, type: 'deposit', amount: paymentAmount, description: `UPI Deposit - UTR: ${utrId}`, date: new Date().toISOString(), balanceAfter: newBalance, referenceId: utrId }; database.ref().update(updates).then(() => { closeModal('upiPaymentModal'); showAnimatedToast(`Successfully added ${formatINR(paymentAmount)}`, 'success'); }).catch(e => showAnimatedToast(e.message, 'error')); }

        function openAgentPayment() { closeModal('paymentMethodModal'); document.getElementById('transactionCode').value = ''; document.getElementById('agentAmountDisplay').textContent = formatINR(paymentAmount); document.getElementById('agentNewBalanceDisplay').textContent = formatINR((currentUser.balance || 0) + paymentAmount); showModal('agentPaymentModal'); }
        function completeAgentPayment() { const code = document.getElementById('transactionCode').value.trim().toUpperCase(); if (!code) return showAnimatedToast('Enter code', 'error'); const btn = document.getElementById('agentConfirmBtn'); btn.classList.add('btn-loading'); database.ref('agentCodes/' + code).once('value').then(snapshot => { if (!snapshot.exists()) { showAnimatedToast('Invalid Agent Code', 'error'); return; } const codeData = snapshot.val(); if (codeData.used) { showAnimatedToast('Code already used', 'error'); return; } if (parseFloat(codeData.amount) !== paymentAmount) { showAnimatedToast(`Code is for ${formatINR(codeData.amount)}. Start over.`, 'error'); return; } const newBalance = (currentUser.balance || 0) + paymentAmount; const transactionId = 'TX' + Date.now(); const updates = {}; updates[`users/${currentUser.accNo}/balance`] = newBalance; updates[`transactions/${transactionId}`] = { transactionId, accNo: currentUser.accNo, type: 'deposit', amount: paymentAmount, description: `Agent Deposit - Ref: ${code}`, date: new Date().toISOString(), balanceAfter: newBalance, referenceId: code }; updates[`agentCodes/${code}/used`] = true; updates[`agentCodes/${code}/usedBy`] = currentUser.accNo; updates[`agentCodes/${code}/usedAt`] = new Date().toISOString(); return database.ref().update(updates).then(() => { closeModal('agentPaymentModal'); showAnimatedToast(`Added ${formatINR(paymentAmount)} via Agent`, 'success'); }); }).catch(e => showAnimatedToast(e.message, 'error')).finally(() => btn.classList.remove('btn-loading')); }
        
        function orderCode() { if(document.getElementById('currentBalanceDisplay')){ document.getElementById('currentBalanceDisplay').textContent = formatINR(currentUser.balance); } document.getElementById('orderAmount').value = ''; document.getElementById('orderPin').value = ''; showModal('orderCodeModal'); }
        function submitOrder() { const amountInput = document.getElementById('orderAmount'); const pinInput = document.getElementById('orderPin'); const amount = parseFloat(amountInput.value); const pin = pinInput.value; if (!amount || amount < 10) return showAnimatedToast('Min ₹10', 'error'); if (pin !== currentUser.pin) return showAnimatedToast('Invalid PIN!', 'error'); if ((currentUser.balance || 0) < amount) return showAnimatedToast('Insufficient Funds!', 'error'); const orderId = 'ORD' + Date.now(); const orderData = { orderId, accNo: currentUser.accNo, fullName: currentUser.fullName, amount, status: 'Pending', date: new Date().toISOString(), agentCode: currentUser.agentCode }; const transactionId = 'TX' + Date.now(); const balanceAfterOrder = (currentUser.balance || 0) - amount; const transactionData = { transactionId, accNo: currentUser.accNo, type: 'order', amount, description: `Order ${orderId}`, date: new Date().toISOString(), balanceAfter: balanceAfterOrder, referenceId: orderId }; const updates = {}; updates[`orders/${orderId}`] = orderData; updates[`transactions/${transactionId}`] = transactionData; updates[`users/${currentUser.accNo}/balance`] = balanceAfterOrder; database.ref().update(updates).then(() => { closeModal('orderCodeModal'); showAnimatedToast('Order Placed Successfully!', 'success'); amountInput.value = ''; pinInput.value = ''; }).catch(e => showAnimatedToast(e.message, 'error')); }

        function payToFriend() { document.getElementById('friendAccNo').value = ''; document.getElementById('transferAmount').value = ''; document.getElementById('transferPin').value = ''; document.getElementById('friendInfo').style.display = 'none'; if(document.getElementById('currentTransferBalance')) { document.getElementById('currentTransferBalance').textContent = formatINR(currentUser.balance); } updateTransferSummary(); showModal('payToFriendModal'); }
        function searchUsers() { const searchTerm = document.getElementById('friendAccNo').value.trim(); const searchResults = document.getElementById('searchResults'); if (searchTerm.length < 2) { searchResults.style.display = 'none'; document.getElementById('friendInfo').style.display = 'none'; return; } searchResults.innerHTML = ''; if (Object.keys(allUsersCache).length > 0) { displaySearchResults(Object.values(allUsersCache).filter(user => user.accNo.includes(searchTerm) || user.fullName.toLowerCase().includes(searchTerm.toLowerCase()))); } else { database.ref('users').once('value').then(snapshot => { snapshot.forEach(childSnapshot => { const user = childSnapshot.val(); allUsersCache[user.accNo] = user; }); displaySearchResults(Object.values(allUsersCache).filter(user => user.accNo.includes(searchTerm) || user.fullName.toLowerCase().includes(searchTerm.toLowerCase()))); }).catch(e => showAnimatedToast('Error: ' + e.message, 'error')); } }
        function displaySearchResults(users) { const searchResults = document.getElementById('searchResults'); if (users.length === 0) { searchResults.innerHTML = '<div class="search-result-item"><span class="text-muted">No users found</span></div>'; searchResults.style.display = 'block'; return; } users.forEach(user => { if (user.accNo === currentUser.accNo) return; const resultItem = document.createElement('div'); resultItem.className = 'search-result-item'; resultItem.innerHTML = `<div class="user-avatar-small">${user.fullName.charAt(0).toUpperCase()}</div><div><div class="font-medium" style="color:var(--md-sys-color-on-surface);">${user.fullName}</div><div class="text-xs text-muted">${user.accNo}</div></div>`; resultItem.onclick = () => { document.getElementById('friendAccNo').value = user.accNo; document.getElementById('friendName').textContent = `${user.fullName} (${user.accNo})`; document.getElementById('friendInfo').style.display = 'block'; document.getElementById('searchResults').style.display = 'none'; updateTransferSummary(); }; searchResults.appendChild(resultItem); }); searchResults.style.display = 'block'; }
        function updateTransferSummary() { const amount = parseFloat(document.getElementById('transferAmount').value) || 0; if(document.getElementById('balanceAfterTransfer')){ document.getElementById('balanceAfterTransfer').textContent = formatINR(Math.max(0, (currentUser.balance || 0) - amount)); } }
        function processTransfer() { const friendAccNo = document.getElementById('friendAccNo').value.trim(); const amount = parseFloat(document.getElementById('transferAmount').value); const pin = document.getElementById('transferPin').value; if (!friendAccNo || !amount || amount <= 0 || pin !== currentUser.pin) return showAnimatedToast('Fill correctly', 'error'); if (friendAccNo === currentUser.accNo) return showAnimatedToast('Self transfer not allowed', 'error'); if (amount > (currentUser.balance || 0)) return showAnimatedToast('Insufficient!', 'error'); database.ref('users/' + friendAccNo).once('value').then(snapshot => { if (!snapshot.exists()) return Promise.reject('User not found'); const friend = snapshot.val(); const timestamp = Date.now(); const transferTime = new Date(timestamp).toLocaleString(); const senderNewBalance = (currentUser.balance || 0) - amount; const receiverNewBalance = (friend.balance || 0) + amount; const notificationId = `NTF${timestamp}`; const senderNotificationId = `NTF${timestamp}S`; const updates = {}; updates[`users/${currentUser.accNo}/balance`] = senderNewBalance; updates[`users/${friendAccNo}/balance`] = receiverNewBalance; updates[`transactions/TX${timestamp}S`] = { transactionId: `TX${timestamp}S`, accNo: currentUser.accNo, type: 'transfer_out', amount, description: `To ${friend.fullName}`, date: new Date().toISOString(), balanceAfter: senderNewBalance }; updates[`transactions/TX${timestamp}R`] = { transactionId: `TX${timestamp}R`, accNo: friendAccNo, type: 'transfer_in', amount, description: `From ${currentUser.fullName}`, date: new Date().toISOString(), balanceAfter: receiverNewBalance }; updates[`userNotifications/${friendAccNo}/${notificationId}`] = { id: notificationId, title: 'Money Received', message: `${currentUser.fullName} sent you ${formatINR(amount)} at ${transferTime}.`, iconType: 'transaction', createdAt: new Date().toISOString(), senderLabel: currentUser.fullName, read: false, audience: 'single', targetAccNo: friendAccNo }; updates[`userNotifications/${currentUser.accNo}/${senderNotificationId}`] = { id: senderNotificationId, title: 'Transfer Sent', message: `You sent ${formatINR(amount)} to ${friend.fullName} at ${transferTime}.`, iconType: 'transaction', createdAt: new Date().toISOString(), senderLabel: 'System', read: false, audience: 'single', targetAccNo: currentUser.accNo }; return database.ref().update(updates); }).then(() => { closeModal('payToFriendModal'); showAnimatedToast(`Sent ${formatINR(amount)} Successfully`, 'success'); }).catch(e => { if (e !== 'User not found') showAnimatedToast(e.message, 'error'); else showAnimatedToast(e, 'error'); }); }

        function filterTransactions(type) { transactionFilter = type; document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active')); event.target.classList.add('active'); loadTransactionHistory(); }

        function loadTransactionHistory() {
            if (!currentUser) return;
            database.ref('transactions').orderByChild('accNo').equalTo(currentUser.accNo).once('value').then(snapshot => {
                const transactionsList = document.getElementById('transactionsList');
                transactionsList.innerHTML = '';
                if (!snapshot.exists()) {
                    transactionsList.innerHTML = `<div class="empty-state"><span class="material-icons-round">history</span><h3>No Transactions</h3><p>Your transaction history is empty.</p></div>`;
                    return;
                }
                let transactions = [];
                snapshot.forEach(childSnapshot => { transactions.push(childSnapshot.val()); });
                transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
                const filteredTransactions = transactionFilter === 'all' ? transactions : transactions.filter(t => t.type === transactionFilter);
                
                if (filteredTransactions.length === 0) {
                    transactionsList.innerHTML = `<div class="empty-state"><span class="material-icons-round">search_off</span><h3>No Results</h3><p>No ${transactionFilter} transactions found.</p></div>`;
                    return;
                }
                filteredTransactions.forEach(transaction => {
                    const date = new Date(transaction.date).toLocaleString();
                    let typeLabel = transaction.type === 'deposit' ? 'Deposit' : transaction.type === 'withdrawal' ? 'Withdrawal' : transaction.type === 'transfer_in' ? 'Received' : transaction.type === 'transfer_out' ? 'Sent' : 'Order';
                    const isNegative = transaction.type === 'withdrawal' || transaction.type === 'transfer_out' || transaction.type === 'order';
                    const amountDisplay = `${isNegative ? '-' : '+'}${formatINR(transaction.amount)}`;
                    const transactionItem = document.createElement('div');
                    transactionItem.className = 'transaction-item';
                    transactionItem.innerHTML = `
                        <div class="transaction-header"><div class="transaction-type"><span class="material-icons-round" style="font-size: 20px;">${transaction.type === 'deposit' ? 'add_circle' : transaction.type === 'withdrawal' ? 'remove_circle' : transaction.type === 'transfer_in' ? 'call_received' : transaction.type === 'transfer_out' ? 'call_made' : 'shopping_cart'}</span><span>${typeLabel}</span></div><div class="transaction-amount ${isNegative ? 'text-error' : 'text-success'}">${amountDisplay}</div></div>
                        <p style="font-size: 13px; margin-bottom: 6px; color: var(--md-sys-color-on-surface);">${transaction.description || 'Transaction'}</p>
                        <div class="transaction-details"><div class="transaction-meta"><span>${date}</span>${transaction.balanceAfter !== undefined ? `<span>Balance: ${formatINR(transaction.balanceAfter)}</span>` : ''}</div>${transaction.referenceId ? `<span class="text-muted text-xs">Ref: ${transaction.referenceId}</span>` : ''}</div>
                    `;
                    transactionsList.appendChild(transactionItem);
                });
            }).catch(error => { showAnimatedToast('Error loading transactions: ' + error.message, 'error'); });
        }

        function updateOrdersSummary(orders) {
            const list = Array.isArray(orders) ? orders : [];
            const totalEl = document.getElementById('ordersStatTotal');
            const pendingEl = document.getElementById('ordersStatPending');
            const completedEl = document.getElementById('ordersStatCompleted');
            const spentEl = document.getElementById('ordersStatSpent');
            if (!totalEl || !pendingEl || !completedEl || !spentEl) return;

            const pendingCount = list.filter(order => (order.status || 'Pending') === 'Pending').length;
            const completedCount = list.filter(order => order.status === 'Completed').length;
            const totalValue = list
                .filter(order => order.status !== 'Cancelled')
                .reduce((sum, order) => sum + (Number(order.amount) || 0), 0);

            totalEl.textContent = list.length;
            pendingEl.textContent = pendingCount;
            completedEl.textContent = completedCount;
            spentEl.textContent = formatINR(totalValue);
        }

        function renderOrderCard(order, index) {
            const status = order.status || 'Pending';
            const statusKey = String(status).toLowerCase();
            const statusClass = statusKey === 'completed' ? 'status-completed' : statusKey === 'cancelled' ? 'status-cancelled' : 'status-pending';
            const statusIcon = statusKey === 'completed' ? 'check_circle' : statusKey === 'cancelled' ? 'cancel' : 'schedule';
            const statusHint = statusKey === 'completed' ? 'Code delivered' : statusKey === 'cancelled' ? 'Refunded to wallet' : 'Awaiting fulfilment';

            let accentA = '#FBBC05';
            let accentB = '#FF9838';
            if (statusKey === 'completed') { accentA = '#34A853'; accentB = '#6DD58C'; }
            else if (statusKey === 'cancelled') { accentA = '#EA4335'; accentB = '#FF6B9D'; }

            const orderId = escapeHtml(order.orderId);
            const createdDate = order.date ? new Date(order.date) : null;
            const fullDate = createdDate ? createdDate.toLocaleString() : 'N/A';
            const shortDate = createdDate ? createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
            const redeemCode = order.redeemCode ? String(order.redeemCode) : '';
            const animationDelay = Math.min(index * 45, 360);

            return `
                <article class="order-card" style="--order-accent-a:${accentA}; --order-accent-b:${accentB}; animation-delay:${animationDelay}ms;">
                    <div class="order-card-top">
                        <div class="order-identity">
                            <div class="order-identity-icon"><span class="material-icons-round">qr_code_2</span></div>
                            <div class="order-identity-text">
                                <div class="order-eyebrow">Order ID</div>
                                <div class="order-id-text">${orderId}</div>
                            </div>
                        </div>
                        <span class="status-badge ${statusClass}">
                            <span class="material-icons-round" style="font-size:14px;">${statusIcon}</span>
                            ${escapeHtml(status)}
                        </span>
                    </div>

                    <div class="order-figures">
                        <div>
                            <div class="order-figure-label">Amount</div>
                            <div class="order-figure-amount">${formatINR(order.amount)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="order-figure-label">Placed On</div>
                            <div class="order-figure-date">${escapeHtml(shortDate)}</div>
                        </div>
                    </div>

                    ${redeemCode && statusKey === 'completed' ? `
                    <div class="order-code-chip">
                        <div style="min-width:0;">
                            <div class="order-code-label">Redeem Code</div>
                            <div class="order-code-value">${escapeHtml(redeemCode)}</div>
                        </div>
                        <button class="order-copy-btn" type="button" title="Copy code" onclick="copyOrderCode('${escapeHtml(redeemCode)}', event)">
                            <span class="material-icons-round">file_copy</span>
                        </button>
                    </div>` : ''}

                    <div class="order-meta-row">
                        <span class="order-meta-chip"><span class="material-icons-round">calendar_today</span> ${escapeHtml(fullDate)}</span>
                        ${order.agentCode ? `<span class="order-meta-chip"><span class="material-icons-round">support_agent</span> Agent ${escapeHtml(order.agentCode)}</span>` : ''}
                    </div>

                    <div class="order-card-footer">
                        <div class="order-timeline">
                            <span class="timeline-dot"></span>
                            <span>${escapeHtml(statusHint)}</span>
                        </div>
                        <button class="order-view-btn" type="button" onclick="viewOrderFullDetails('${orderId}')">
                            View Details <span class="material-icons-round">arrow_forward</span>
                        </button>
                    </div>
                </article>
            `;
        }

        function copyOrderCode(code, event) {
            if (event) event.stopPropagation();
            if (!code) return;
            navigator.clipboard.writeText(code)
                .then(() => showAnimatedToast('Code copied to clipboard!', 'success'))
                .catch(() => showAnimatedToast('Failed to copy code', 'error'));
        }

        function loadUserOrders() { 
            if (!currentUser) return; 
            database.ref('orders').orderByChild('accNo').equalTo(currentUser.accNo).once('value').then(snapshot => { 
                const ordersTable = document.getElementById('userOrdersTable'); 
                const container = document.getElementById('ordersTableContainer');
                const emptyState = document.getElementById('ordersEmptyState');
                
                if (!ordersTable) return;
                ordersTable.innerHTML = ''; 
                myOrdersCache = {};

                if (!snapshot.exists()) {
                    if (container) container.style.display = 'none';
                    if (emptyState) emptyState.style.display = 'flex';
                    updateOrdersSummary([]);
                    return;
                }
                
                const orders = [];
                snapshot.forEach(c => { 
                    const order = c.val();
                    if (order && order.orderId) {
                        myOrdersCache[order.orderId] = order;
                        orders.push(order);
                    }
                });

                orders.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

                if (container) container.style.display = 'block';
                if (emptyState) emptyState.style.display = 'none';

                updateOrdersSummary(orders);

                ordersTable.innerHTML = orders.map((order, index) => renderOrderCard(order, index)).join('');
            }).catch(e => showAnimatedToast(e.message, 'error')); 
        }

        function viewOrderFullDetails(orderId) {
            const order = myOrdersCache[orderId];
            if(!order) return showAnimatedToast('Order not found', 'error');

            document.getElementById('viewOrderId').innerText = order.orderId;
            document.getElementById('viewOrderStatus').innerHTML = `<span class="status-badge ${order.status === 'Completed' ? 'status-completed' : order.status === 'Cancelled' ? 'status-cancelled' : 'status-pending'}">${order.status}</span>`;
            document.getElementById('viewOrderAmount').innerText = formatINR(order.amount);
            document.getElementById('viewOrderDate').innerText = new Date(order.date).toLocaleString();

            const codeSection = document.getElementById('viewOrderCodeSection');
            if(order.status === 'Completed' && order.redeemCode) {
                document.getElementById('viewOrderCodeValue').innerText = order.redeemCode;
                codeSection.style.display = 'block';
            } else {
                codeSection.style.display = 'none';
            }

            showModal('userOrderDetailsModal');
        }

        function copyViewOrderCode() {
            const code = document.getElementById('viewOrderCodeValue').innerText;
            if(!code || code === '...') return;
            navigator.clipboard.writeText(code).then(() => showAnimatedToast('Copied to clipboard!', 'success')).catch(() => showAnimatedToast('Failed to copy', 'error')); 
        }

        // ==========================================
        // ADMIN — AUTH
        // ==========================================
        function showAdminModal() { showModal('adminModal'); }
        function closeAdminModal() { closeModal('adminModal'); }

        async function adminGoogleLogin() {
            if (googleAuthInProgress) return;
            googleAuthInProgress = true;
            try {
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                const result = await auth.signInWithPopup(googleProvider);
                const firebaseUser = result && result.user;
                if (!firebaseUser) throw new Error('No Google user returned');
                const adminUser = await findPlayCodeUserByGoogleUid(firebaseUser.uid);
                if (!adminUser || String(adminUser.role || '').toLowerCase() !== 'admin') {
                    await auth.signOut().catch(() => {});
                    showAnimatedToast('This Google account is not authorized as an admin.', 'error');
                    return;
                }
                currentAdmin = true;
                currentUser = adminUser;
                closeAdminModal();
                showAdminPanel();
                loadAllUsers();
                loadAllOrders();
                showAnimatedToast('Admin Access Granted', 'success');
            } catch (error) { handleGoogleAuthError(error); }
            finally { googleAuthInProgress = false; }
        }

        function logoutAdmin() { currentAdmin = false; document.getElementById('adminPanel').style.display = 'none'; showSignIn(); clearSignInForm(); showAnimatedToast('Admin session ended', 'info'); }
        function showAdminPanel() { document.getElementById('signinPage').style.display = 'none'; document.getElementById('adminPanel').style.display = 'flex'; window.scrollTo(0, 0); }

        function showGenerateCodeModal() { document.getElementById('generateCodeAmount').value = ''; document.getElementById('generatedCodeDisplaySection').style.display = 'none'; showModal('adminGenerateCodeModal'); }
        function adminGenerateAgentCode() { const amount = parseFloat(document.getElementById('generateCodeAmount').value); if (!amount || amount < 10) return showAnimatedToast('Enter valid amount (Min 10)', 'error'); const code = 'PL0' + Math.floor(10000 + Math.random() * 90000); const codeData = { code: code, amount: amount, used: false, createdBy: 'admin', createdAt: new Date().toISOString() }; database.ref('agentCodes/' + code).set(codeData).then(() => { document.getElementById('generatedCodeResult').innerText = code; document.getElementById('generatedCodeDisplaySection').style.display = 'block'; showAnimatedToast('Code Generated successfully!', 'success'); }).catch(e => showAnimatedToast(e.message, 'error')); }

        // ==========================================
        // ADMIN — DATA LOADING (accounts + code requests)
        // ==========================================
        function adminRefreshAll() {
            loadAllUsers();
            loadAllOrders();
            showAnimatedToast('Console refreshed', 'success');
        }

        function loadAllUsers() {
            database.ref('users').once('value').then(snapshot => {
                adminUsersCache = {};
                if (snapshot.exists()) {
                    snapshot.forEach(c => {
                        const user = c.val();
                        if (user && user.accNo) {
                            adminUsersCache[user.accNo] = user;
                            allUsersCache[user.accNo] = user;
                        }
                    });
                }
                renderAdminUsers();
                renderAdminStats();
            }).catch(e => showAnimatedToast(e.message, 'error'));
        }

        function loadAllOrders() {
            database.ref('orders').once('value').then(snapshot => {
                adminOrdersCache = {};
                if (snapshot.exists()) {
                    snapshot.forEach(c => {
                        const order = c.val();
                        if (order && order.orderId) adminOrdersCache[order.orderId] = order;
                    });
                }
                renderAdminOrders();
                renderAdminUsers();
                renderAdminStats();
            }).catch(e => showAnimatedToast(e.message, 'error'));
        }

        function renderAdminStats() {
            const users = Object.values(adminUsersCache);
            const orders = Object.values(adminOrdersCache);
            const now = Date.now();

            const totalBalance = users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);
            const lockedCount = users.filter(u => (u.lockedUntil && u.lockedUntil > now) || u.adminLocked).length;
            const pendingCount = orders.filter(o => (o.status || 'Pending') === 'Pending').length;
            const completedCount = orders.filter(o => o.status === 'Completed').length;

            setText('adminStatUsers', users.length);
            setText('adminStatBalance', formatINR(totalBalance));
            setText('adminStatPending', pendingCount);
            setText('adminStatCompleted', completedCount);
            setText('adminStatLocked', lockedCount);
        }

        function adminUserCard(user, isLocked, index) {
            const accNo = escapeHtml(user.accNo);
            const name = escapeHtml(user.fullName || 'Unknown');
            const initial = escapeHtml((user.fullName || 'U').charAt(0).toUpperCase());
            const balance = formatINR(user.balance || 0);
            const agent = escapeHtml(user.agentCode || '—');
            const joined = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'N/A';
            const accentA = isLocked ? '#EA4335' : '#4285F4';
            const accentB = isLocked ? '#FF6B9D' : '#B983FF';
            const orderCount = Object.values(adminOrdersCache).filter(o => o.accNo === user.accNo).length;

            let lockInfo = '';
            if (isLocked) {
                const reason = user.adminLocked
                    ? 'Locked by admin (PIN failure limit)'
                    : 'Locked until ' + new Date(user.lockedUntil).toLocaleString();
                lockInfo = `<div class="account-lock-note"><span class="material-icons-round">lock</span> <span>${escapeHtml(reason)}</span></div>`;
            }

            return `
            <article class="account-card" style="--acc-a:${accentA}; --acc-b:${accentB}; animation-delay:${Math.min(index * 30, 240)}ms;">
                <div class="account-top">
                    <div class="account-identity">
                        <div class="account-avatar">${initial}</div>
                        <div style="min-width:0;">
                            <div class="account-name">${name}</div>
                            <div class="account-no">${accNo}</div>
                        </div>
                    </div>
                    <span class="status-badge ${isLocked ? 'status-cancelled' : 'status-completed'}">
                        <span class="material-icons-round" style="font-size:13px;">${isLocked ? 'lock' : 'check_circle'}</span>
                        ${isLocked ? 'Locked' : 'Active'}
                    </span>
                </div>

                <div class="account-balance-box">
                    <div>
                        <div class="account-balance-label">Wallet Balance</div>
                        <div class="account-balance-value">${balance}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="account-balance-label">Orders</div>
                        <div class="account-balance-value" style="color:var(--md-sys-color-primary);">${orderCount}</div>
                    </div>
                </div>

                ${lockInfo}

                <div class="order-meta-row">
                    <span class="order-meta-chip"><span class="material-icons-round">support_agent</span> Agent ${agent}</span>
                    <span class="order-meta-chip"><span class="material-icons-round">calendar_today</span> ${escapeHtml(joined)}</span>
                </div>

                <div class="account-actions">
                    <button class="action-btn action-btn-primary" onclick="showAdminBalanceModal('${accNo}')">
                        <span class="material-icons-round">account_balance_wallet</span> Balance
                    </button>
                    <button class="action-btn action-btn-success" onclick="openAdminAccountDetails('${accNo}')">
                        <span class="material-icons-round">visibility</span> View Details
                    </button>
                    ${isLocked
                        ? `<button class="action-btn action-btn-success" onclick="unlockUser('${accNo}')"><span class="material-icons-round">lock_open</span> Unlock</button>`
                        : `<button class="action-btn action-btn-danger" onclick="deleteUser('${accNo}')"><span class="material-icons-round">delete</span> Delete</button>`}
                </div>
            </article>`;
        }

        function renderAdminUsers() {
            const usersGrid = document.getElementById('adminUsersGrid');
            const lockedGrid = document.getElementById('adminLockedGrid');
            const usersEmpty = document.getElementById('adminUsersEmpty');
            const lockedEmpty = document.getElementById('adminLockedEmpty');
            if (!usersGrid || !lockedGrid) return;

            const now = Date.now();
            const term = adminSearchTerm.trim();
            const all = Object.values(adminUsersCache);

            const matches = (u) => {
                if (!term) return true;
                const name = String(u.fullName || '').toLowerCase();
                const acc = String(u.accNo || '').toLowerCase();
                const agent = String(u.agentCode || '').toLowerCase();
                return name.includes(term) || acc.includes(term) || agent.includes(term);
            };

            const visible = all.filter(matches).sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
            const active = visible.filter(u => !((u.lockedUntil && u.lockedUntil > now) || u.adminLocked));
            const locked = visible.filter(u => (u.lockedUntil && u.lockedUntil > now) || u.adminLocked);

            usersGrid.innerHTML = active.map((u, i) => adminUserCard(u, false, i)).join('');
            lockedGrid.innerHTML = locked.map((u, i) => adminUserCard(u, true, i)).join('');

            if (usersEmpty) usersEmpty.style.display = active.length ? 'none' : 'flex';
            if (lockedEmpty) lockedEmpty.style.display = locked.length ? 'none' : 'flex';

            setText('adminTabUsersCount', visible.length);
            setText('adminTabLockedCount', locked.length);
        }

        function adminOrderGroupCard(entry, index) {
            const { accNo, list, user } = entry;
            const name = escapeHtml((user && user.fullName) || 'Unknown User');
            const initial = escapeHtml(((user && user.fullName) || 'U').charAt(0).toUpperCase());
            const pending = list.filter(o => (o.status || 'Pending') === 'Pending').length;
            const completed = list.filter(o => o.status === 'Completed').length;
            const cancelled = list.filter(o => o.status === 'Cancelled').length;
            const totalValue = list
                .filter(o => o.status !== 'Cancelled')
                .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
            const latest = list[0];
            const latestDate = latest && latest.date ? new Date(latest.date).toLocaleString() : 'N/A';

            const accentA = pending > 0 ? '#FBBC05' : '#34A853';
            const accentB = pending > 0 ? '#FF9838' : '#6DD58C';
            const safeAccNo = escapeHtml(accNo);

            return `
            <article class="account-card" style="--acc-a:${accentA}; --acc-b:${accentB}; animation-delay:${Math.min(index * 30, 240)}ms;">
                <div class="account-top">
                    <div class="account-identity">
                        <div class="account-avatar">${initial}</div>
                        <div style="min-width:0;">
                            <div class="account-name">${name}</div>
                            <div class="account-no">${safeAccNo}</div>
                        </div>
                    </div>
                    <span class="status-badge ${pending > 0 ? 'status-pending' : 'status-completed'}">
                        <span class="material-icons-round" style="font-size:13px;">${pending > 0 ? 'schedule' : 'check_circle'}</span>
                        ${pending > 0 ? pending + ' Pending' : 'All Clear'}
                    </span>
                </div>

                <div class="account-balance-box">
                    <div>
                        <div class="account-balance-label">Code Requests</div>
                        <div class="account-balance-value" style="color:var(--md-sys-color-primary);">${list.length}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="account-balance-label">Total Value</div>
                        <div class="account-balance-value">${formatINR(totalValue)}</div>
                    </div>
                </div>

                <div class="order-meta-row">
                    <span class="order-meta-chip"><span class="material-icons-round">schedule</span> ${pending} Pending</span>
                    <span class="order-meta-chip"><span class="material-icons-round">check_circle</span> ${completed} Completed</span>
                    ${cancelled ? `<span class="order-meta-chip"><span class="material-icons-round">cancel</span> ${cancelled} Cancelled</span>` : ''}
                </div>

                <div class="account-note">
                    <span class="material-icons-round">history</span> Latest request: ${escapeHtml(latestDate)}
                </div>

                <div class="account-actions">
                    <button class="action-btn action-btn-primary" onclick="openAdminAccountDetails('${safeAccNo}')">
                        <span class="material-icons-round">visibility</span> View Details
                    </button>
                </div>
            </article>`;
        }

        function renderAdminOrders() {
            const grid = document.getElementById('adminOrdersGrid');
            const empty = document.getElementById('adminOrdersEmpty');
            if (!grid) return;

            const term = adminSearchTerm.trim();
            const orders = Object.values(adminOrdersCache);

            const groups = {};
            orders.forEach(o => {
                const key = o.accNo || 'unknown';
                if (!groups[key]) groups[key] = [];
                groups[key].push(o);
            });

            let entries = Object.keys(groups).map(accNo => {
                const list = groups[accNo].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                return { accNo, list, user: adminUsersCache[accNo] || null };
            });

            if (term) {
                entries = entries.filter(e => {
                    const name = String((e.user && e.user.fullName) || '').toLowerCase();
                    const acc = String(e.accNo).toLowerCase();
                    return name.includes(term) || acc.includes(term);
                });
            }

            entries.sort((a, b) => new Date(b.list[0].date || 0) - new Date(a.list[0].date || 0));

            grid.innerHTML = entries.map((e, i) => adminOrderGroupCard(e, i)).join('');
            if (empty) empty.style.display = entries.length ? 'none' : 'flex';

            setText('adminTabOrdersCount', entries.length);
        }

        // ==========================================
        // ADMIN — SEARCH / TABS
        // ==========================================
        function adminHandleSearch(value) {
            adminSearchTerm = String(value || '').toLowerCase();
            const clearBtn = document.getElementById('adminSearchClear');
            if (clearBtn) clearBtn.classList.toggle('show', adminSearchTerm.length > 0);
            renderAdminUsers();
            renderAdminOrders();
        }

        function adminClearSearch() {
            const input = document.getElementById('adminSearchInput');
            if (input) input.value = '';
            adminHandleSearch('');
            if (input) input.focus();
        }

        function adminSwitchTab(tab) {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            document.querySelectorAll('.admin-section').forEach(s => s.classList.toggle('active', s.id === 'adminSection-' + tab));
        }

        // ==========================================
        // ADMIN — ACCOUNT-WISE CODE REQUESTS MODAL
        // ==========================================
        function openAdminAccountDetails(accNo) {
            const body = document.getElementById('adminAccountOrdersBody');
            const title = document.getElementById('adminAccountModalTitle');
            if (!body) return;

            const user = adminUsersCache[accNo] || null;
            const name = (user && user.fullName) || 'Unknown User';

            const orders = Object.values(adminOrdersCache)
                .filter(o => o.accNo === accNo)
                .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            if (title) title.textContent = name + ' · ' + accNo;

            const balance = user ? formatINR(user.balance || 0) : '₹0';
            const pending = orders.filter(o => (o.status || 'Pending') === 'Pending').length;
            const totalValue = orders
                .filter(o => o.status !== 'Cancelled')
                .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

            const summary = `
                <div class="admin-account-summary">
                    <div class="admin-account-summary-item">
                        <div class="account-balance-label">Wallet Balance</div>
                        <div class="account-balance-value">${balance}</div>
                    </div>
                    <div class="admin-account-summary-item">
                        <div class="account-balance-label">Total Orders</div>
                        <div class="account-balance-value" style="color:var(--md-sys-color-primary);">${orders.length}</div>
                    </div>
                    <div class="admin-account-summary-item">
                        <div class="account-balance-label">Pending</div>
                        <div class="account-balance-value" style="color:#FBBC05;">${pending}</div>
                    </div>
                    <div class="admin-account-summary-item">
                        <div class="account-balance-label">Order Value</div>
                        <div class="account-balance-value" style="color:#6DD58C;">${formatINR(totalValue)}</div>
                    </div>
                </div>
            `;

            const listHtml = orders.length ? orders.map(o => {
                const status = o.status || 'Pending';
                const statusKey = String(status).toLowerCase();
                const statusClass = statusKey === 'completed' ? 'status-completed' : statusKey === 'cancelled' ? 'status-cancelled' : 'status-pending';
                const date = o.date ? new Date(o.date).toLocaleString() : 'N/A';
                const safeOrderId = escapeHtml(o.orderId);
                return `
                <div class="admin-order-row">
                    <div style="min-width:0; flex:1;">
                        <div class="admin-order-id">${safeOrderId}</div>
                        <div class="admin-order-meta">${escapeHtml(date)}${o.redeemCode ? ' · Code: ' + escapeHtml(o.redeemCode) : ''}</div>
                    </div>
                    <div class="admin-order-right">
                        <div class="admin-order-amount">${formatINR(o.amount)}</div>
                        <span class="status-badge ${statusClass}">${escapeHtml(status)}</span>
                    </div>
                    <button class="action-btn action-btn-success" type="button" title="Fulfil / Edit order" onclick="adminEditOrder('${safeOrderId}')">
                        <span class="material-icons-round">edit</span>
                    </button>
                </div>`;
            }).join('') : `
                <div class="empty-state" style="padding:34px 20px;">
                    <span class="material-icons-round">receipt_long</span>
                    <h3>No Orders</h3>
                    <p>This account has not placed any code requests yet.</p>
                </div>
            `;

            body.innerHTML = summary + `<div class="admin-orders-list">${listHtml}</div>`;
            showModal('adminAccountOrdersModal');
        }

        function adminEditOrder(orderId) {
            const modal = document.getElementById('adminAccountOrdersModal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
            }
            document.body.style.overflow = '';
            showOrderDetails(orderId);
        }

        // ==========================================
        // ADMIN — USER ACTIONS
        // ==========================================
        function unlockUser(accNo) {
            database.ref('users/' + accNo).update({
                failedAttempts: 0,
                lockCount: 0,
                lockedUntil: null,
                adminLocked: false
            }).then(() => {
                showAnimatedToast('Account unlocked successfully', 'success');
                loadAllUsers();
            });
        }

        function showAdminBalanceModal(accNo) {
            selectedUserId = accNo;
            database.ref('users/' + accNo).once('value').then(s => {
                const user = s.val();
                if (!user) return showAnimatedToast('User not found', 'error');
                document.getElementById('adminUserInfo').textContent = `User: ${user.fullName} (${accNo})`;
                document.getElementById('adminCurrentBalance').textContent = `Bal: ${formatINR(user.balance || 0)}`;
                document.getElementById('adminBalanceAmount').value = '';
                showModal('adminBalanceModal');
            });
        }

        function updateUserBalance() {
            const action = document.getElementById('balanceAction').value;
            const amount = parseFloat(document.getElementById('adminBalanceAmount').value);
            if (!amount) return;
            database.ref('users/' + selectedUserId).once('value').then(s => {
                let bal = s.val().balance || 0;
                action === 'add' ? bal += amount : bal -= amount;
                if (bal < 0) bal = 0;
                const updates = {};
                updates[`users/${selectedUserId}/balance`] = bal;
                return database.ref().update(updates);
            }).then(() => {
                loadAllUsers();
                closeModal('adminBalanceModal');
                showAnimatedToast('Balance Updated Successfully', 'success');
            });
        }

        function deleteUser(accNo) {
            if (confirm('Delete user ' + accNo + '?')) database.ref('users/' + accNo).remove().then(() => {
                loadAllUsers();
                loadAllOrders();
            });
        }

        // ==========================================
        // ADMIN — ORDER FULFILMENT
        // ==========================================
        function showOrderDetails(orderId) {
            selectedOrderId = orderId;
            database.ref('orders/' + orderId).once('value').then(s => {
                const o = s.val();
                if (!o) return showAnimatedToast('Order not found', 'error');
                document.getElementById('orderInfo').textContent = `Order: ${orderId} · ${formatINR(o.amount)}`;
                document.getElementById('orderUserInfo').textContent = `User: ${o.accNo}${o.fullName ? ' · ' + o.fullName : ''}`;
                document.getElementById('redeemCode').value = o.redeemCode || '';
                showModal('orderDetailsModal');
            });
        }

        function completeOrder() {
            const code = document.getElementById('redeemCode').value.trim();
            if (!code) return;
            database.ref('orders/' + selectedOrderId).update({ status: 'Completed', redeemCode: code }).then(() => {
                loadAllOrders();
                closeModal('orderDetailsModal');
                showAnimatedToast('Order Completed', 'success');
            });
        }

        function cancelOrder() {
            if (!confirm('Refund?')) return;
            database.ref('orders/' + selectedOrderId).once('value').then(s => {
                const o = s.val();
                return database.ref('users/' + o.accNo).once('value').then(us => {
                    const u = us.val();
                    const updates = {};
                    updates[`orders/${selectedOrderId}/status`] = 'Cancelled';
                    updates[`users/${o.accNo}/balance`] = (u.balance || 0) + o.amount;
                    return database.ref().update(updates);
                });
            }).then(() => {
                loadAllOrders();
                closeModal('orderDetailsModal');
                showAnimatedToast('Order Refunded', 'success');
            });
        }

        // ==========================================
        // MISC UI
        // ==========================================
        function rateUs() { resetStars(); showModal('rateModal'); }
        function rate(stars) { currentRating = stars; document.querySelectorAll('#starRating .star').forEach((star, i) => { if (i < stars) { star.textContent = 'star'; } else { star.textContent = 'star_outline'; } }); setTimeout(() => { closeModal('rateModal'); showAnimatedToast(`Thanks for ${stars} stars!`, 'success'); currentRating = 0; }, 600); }
        function resetStars() { document.querySelectorAll('#starRating .star').forEach(star => { star.textContent = 'star_outline'; }); }

        function showModal(modalId) { const el = document.getElementById(modalId); if (!el) return; el.style.display = 'flex'; setTimeout(() => el.classList.add('show'), 10); document.body.style.overflow = 'hidden'; }
        function closeModal(modalId) { const el = document.getElementById(modalId); if (!el) return; el.classList.remove('show'); setTimeout(() => el.style.display = 'none', 460); document.body.style.overflow = ''; }
        
        window.onclick = function(event) { if (event.target.classList.contains('modal')) closeModal(event.target.id); }

        document.addEventListener('DOMContentLoaded', function() { 
            document.getElementById('transferAmount')?.addEventListener('input', updateTransferSummary); 
            document.getElementById('directSignInKey')?.addEventListener('keypress', function(e) { if (e.key === 'Enter') processDirectSignIn(); }); 
        });

        document.addEventListener('click', function(event) { 
            const dropdown = document.getElementById('userDropdown');
            const userAvatar = document.querySelector('.user-avatar'); 
            if (dropdown && dropdown.classList.contains('show') && !dropdown.contains(event.target) && !userAvatar.contains(event.target)) { dropdown.classList.remove('show'); }
            
            const notificationPanel = document.getElementById('notificationPanel');
            const notificationButton = document.querySelector('.notification-button');
            if (notificationPanel && notificationPanel.classList.contains('show') && !notificationPanel.contains(event.target) && (!notificationButton || !notificationButton.contains(event.target))) { closeNotificationsPanel(); }
            
            const searchResults = document.getElementById('searchResults'); 
            if (searchResults && searchResults.style.display !== 'none' && !event.target.closest('.user-search')) { searchResults.style.display = 'none'; }
        });

        // ==========================================
        // BOOTSTRAP FIREBASE AUTH (Google session restore)
        // ==========================================
        showSignIn();
        initializeFirebaseAuth();
    


        function runRecaptcha(e) {
            e.preventDefault();

            grecaptcha.ready(function() {
                grecaptcha.execute('6LdjKNAtAAAAADGMyiyq61CH79sj62xSUw18AKBw', {action: 'submit'}).then(function(token) {
                    document.getElementById('recaptchaResponse').value = token;
                    console.log("reCAPTCHA Token:", token);

                    startGoogleAccountCreation();
                }).catch(function(error) {
                    console.error("reCAPTCHA error:", error);
                    showAnimatedToast("Security verification failed. Please try again.", "error");
                });
            });
        }
    


        // ================= PLAYCODEX PWA INSTALL SYSTEM =================
        (() => {
            let deferredInstallPrompt = null;
            const popup = () => document.getElementById('pwaInstallPopup');
            const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

            function showPwaInstallPopup() {
                if (!popup() || isStandalone()) return;
                popup().classList.add('show');
                popup().setAttribute('aria-hidden', 'false');
            }
            function hidePwaInstallPopup() {
                if (!popup()) return;
                popup().classList.remove('show');
                popup().setAttribute('aria-hidden', 'true');
            }

            window.addEventListener('beforeinstallprompt', (event) => {
                event.preventDefault();
                deferredInstallPrompt = event;
                // Show only after the user has seen the app, avoiding an instant popup.
                setTimeout(showPwaInstallPopup, 1800);
            });

            window.addEventListener('appinstalled', () => {
                deferredInstallPrompt = null;
                hidePwaInstallPopup();
                if (typeof showAnimatedToast === 'function') showAnimatedToast('PlaycodeX installed successfully!', 'success');
            });

            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
                    if (!deferredInstallPrompt) {
                        hidePwaInstallPopup();
                        return;
                    }
                    deferredInstallPrompt.prompt();
                    const choice = await deferredInstallPrompt.userChoice;
                    deferredInstallPrompt = null;
                    hidePwaInstallPopup();
                    console.log('PWA install choice:', choice.outcome);
                });
                document.getElementById('pwaLaterBtn')?.addEventListener('click', hidePwaInstallPopup);
                document.getElementById('pwaCloseBtn')?.addEventListener('click', hidePwaInstallPopup);

                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('./sw.js').then(reg => {
                        console.log('PlaycodeX service worker registered:', reg.scope);
                    }).catch(err => console.warn('PWA service worker registration failed:', err));
                }
            });

            // Expose manual installer for an optional Install button anywhere in the UI.
            window.installPlaycodeX = async function() {
                if (!deferredInstallPrompt) { showPwaInstallPopup(); return false; }
                deferredInstallPrompt.prompt();
                await deferredInstallPrompt.userChoice;
                deferredInstallPrompt = null;
                hidePwaInstallPopup();
                return true;
            };
        })();
    
