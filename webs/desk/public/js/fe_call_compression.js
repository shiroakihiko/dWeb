

async function compressVideoFrame(videoFrame) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Reduce dimensions - adjust these values as needed
    const scaleFactor = CONFIG.scaleFactor; // Reduce to 50% size
    canvas.width = videoFrame.displayWidth * scaleFactor;
    canvas.height = videoFrame.displayHeight * scaleFactor;
    
    ctx.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
    
    // Convert to JPEG with quality setting (0.5 = 50% quality)
    const jpegBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', CONFIG.jpegQuality));
    return new Uint8Array(await jpegBlob.arrayBuffer());
}