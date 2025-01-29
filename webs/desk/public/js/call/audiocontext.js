// Improved AudioContext Management
class AudioContextManager {
    constructor() {
        this.audioContext = null;
        this.setupUserInteractionListeners();
    }

    setupUserInteractionListeners() {
        const resumeAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume()
                .then(() => console.log('AudioContext resumed'))
                .catch(error => console.error('Failed to resume AudioContext:', error));
            }
        };

        // Multiple ways to potentially resume audio
        const resumeTriggers = [
            'click', 'touchstart', 'touchend',
            'mousedown', 'keydown', 'focus'
        ];

        resumeTriggers.forEach(eventType => {
            document.addEventListener(eventType, resumeAudio, { once: false });
        });
    }

    getAudioContext() {
        // Create AudioContext if it doesn't exist
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
        }

        // Attempt to resume if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume()
            .catch(error => {
                console.error('Could not resume AudioContext:', error);
                // Fallback: create a new context
                this.audioContext = new AudioContext();
            });
        }

        return this.audioContext;
    }

    createAudioResumeBanner() {
        const banner = document.createElement('div');
        banner.innerHTML = `
        <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        background-color: #ff6b6b;
        color: white;
        text-align: center;
        padding: 10px;
        z-index: 1000;
        ">
        Audio is blocked. Click anywhere to enable audio
        </div>
        `;

        const removeBanner = () => {
            banner.remove();
            this.getAudioContext(); // Attempt to resume
        };

        // Remove banner on any interaction
        document.addEventListener('click', removeBanner, { once: true });
        document.addEventListener('keydown', removeBanner, { once: true });

        document.body.appendChild(banner);

        // Automatically remove banner after 5 seconds
        setTimeout(() => {
            if (document.body.contains(banner)) {
                removeBanner();
            }
        }, 5000);
    }
}
