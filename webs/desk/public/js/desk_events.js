let globalEvents = new Map();

class DeskEvents
{
    constructor() {
    }

    dispatchEvent(eventType, detail) {
        const customEvent = new CustomEvent(eventType, { detail });
        const eventFunction = globalEvents.get(eventType);
        if(eventFunction)
            eventFunction(customEvent);
    }
    removeEventListener(eventType)
    {
        globalEvents.delete(eventType);
    }
}
