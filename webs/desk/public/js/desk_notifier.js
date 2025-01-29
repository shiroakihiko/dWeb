class DeskNotifier {
    static #sounds = {
        email: new Audio('/desk/sounds/email.mp3'),
        emailOut: new Audio('/desk/sounds/email-out.mp3'),
        login: new Audio('/desk/sounds/login.mp3'),
        callIncoming: new Audio('/desk/sounds/call-incoming.mp3'),
        callOutgoing: new Audio('/desk/sounds/call-outgoing.mp3'),
        callEnd: new Audio('/desk/sounds/call-end.mp3'),
        walletIn: new Audio('/desk/sounds/wallet-in.mp3'),
        walletOut: new Audio('/desk/sounds/wallet-out.mp3')
    };

    static #loopingSound = null;
    static #loopInterval = null;

    static playSound(soundType, loop = false, loopDelay = 0) {
        const sound = this.#sounds[soundType];
        if (!sound) return;

        // Stop any existing looping sound
        this.stopLoopingSound();

        if (loop) {
            sound.loop = loopDelay == 0;
            this.#loopingSound = sound;
            sound.currentTime = 0;
            sound.play().catch(err => console.log('Audio play failed:', err));

            if (loopDelay > 0) {
                this.#loopInterval = setInterval(() => {
                    sound.currentTime = 0;
                    sound.play().catch(err => console.log('Audio play failed:', err));
                }, loopDelay);
            }
        } else {
            sound.currentTime = 0;
            sound.play().catch(err => console.log('Audio play failed:', err));
        }
    }

    static stopLoopingSound() {
        if (this.#loopingSound) {
            this.#loopingSound.loop = false;
            this.#loopingSound.pause();
            this.#loopingSound.currentTime = 0;
            this.#loopingSound = null;

            if (this.#loopInterval) {
                clearInterval(this.#loopInterval);
                this.#loopInterval = null;
            }
        }
    }

    static show({ title, message, type, duration = 5000, playSound = true, soundType = null, buttons = null }) {
        if (playSound) {
            this.playSound(soundType || type);
        }
        // Send to Android native notifications if available
        if (window.Android) {
            window.Android.showNotification(title, message, type);
        }

        const notification = document.createElement('div');
        notification.className = 'desk-notification';
        
        let buttonsHtml = '';
        if (buttons) {
            buttonsHtml = `
                <div class="notification-buttons">
                    ${buttons.map(btn => `
                        <button class="notification-btn ${btn.class || ''}" 
                            data-action="${btn.text.toLowerCase()}">${btn.text}</button>
                    `).join('')}
                </div>
            `;
        }

        notification.innerHTML = `
            <div class="notification-icon ${type}"></div>
            <div class="notification-content">
                <h4>${title}</h4>
                <p>${message}</p>
                ${buttonsHtml}
            </div>
            <button class="notification-close">&times;</button>
        `;

        // Add to notification container
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }

        // Add button handlers
        if (buttons) {
            const buttonElements = notification.querySelectorAll('.notification-btn');
            buttonElements.forEach((btn, index) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    buttons[index].onClick();
                    notification.remove();
                };
            });
        }

        // Add close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.onclick = () => {
            this.stopLoopingSound();
            notification.remove();
        };

        // Add to container
        container.appendChild(notification);

        // Slide in animation
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto remove after duration if specified
        if (duration) {
            setTimeout(() => {
                if (document.contains(notification)) {
                    this.stopLoopingSound();
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                }
            }, duration);
        }

        return notification;
    }

    // Add this method to handle call actions from Android
    static handleIncomingCall(action) {
        // Find the notification with call buttons and simulate the click
        const container = document.getElementById('notification-container');
        if (container) {
            const notifications = container.getElementsByClassName('desk-notification');
            for (const notification of notifications) {
                const buttons = notification.getElementsByClassName('notification-btn');
                for (const button of buttons) {
                    if ((action === 'accept' && button.textContent.toLowerCase().includes('accept')) ||
                        (action === 'reject' && button.textContent.toLowerCase().includes('reject'))) {
                        button.click();
                        return;
                    }
                }
            }
        }
    }
}