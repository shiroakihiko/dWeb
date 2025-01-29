// Data type markers
const DATA_TYPES = {
    AUDIO: 0x02
};

// The AudioProcessor class
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.sampleRate = 48000;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            
            // Apply simple noise gate to reduce background noise
            for (let i = 0; i < channelData.length; i++) {
                // Noise gate threshold
                const threshold = 0.01;
                this.buffer[this.bufferIndex++] = 
                    Math.abs(channelData[i]) < threshold ? 0 : channelData[i];
                
                // When buffer is full, send it
                if (this.bufferIndex >= this.bufferSize) {
                    // Apply slight smoothing to prevent clicks
                    this.smoothBuffer();
                    
                    this.port.postMessage({
                        type: 'rawAudioData',
                        audioData: this.buffer.slice()
                    });
                    this.bufferIndex = 0;
                }
            }
        }
        return true;
    }

    smoothBuffer() {
        // Apply simple smoothing at buffer boundaries
        const smoothingFactor = 0.1;
        if (this.lastSample !== undefined) {
            // Smooth transition from last buffer
            this.buffer[0] = this.lastSample * (1 - smoothingFactor) + 
                            this.buffer[0] * smoothingFactor;
        }
        // Store last sample for next buffer
        this.lastSample = this.buffer[this.bufferSize - 1];
    }
}

// Register the AudioProcessor as an AudioWorkletProcessor
registerProcessor('audio-processor', AudioProcessor);
