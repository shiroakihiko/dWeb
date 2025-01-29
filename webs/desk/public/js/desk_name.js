class DeskName
{
    constructor() {
        this.cachedDomainsByAccount = {};
        this.cachedDomainsByName = {};
    }
    
    async resolveName(name)
    {
        if(this.cachedDomainsByName[name])
            return this.cachedDomainsByName[name];

        const networkId = this.getDomainNetwork();
        if(networkId == null)
            return null;

        const result = await desk.networkRequest({ networkId: networkId, action: 'lookupDomain', domainName: name });    
        if(result.success)
        {
            this.cachedDomainsByName[name] = result.domain;
            return result.domain;
        }
        else
            return null;
    }
    
    async getDefaultDomain(accountId)
    {
        if(this.cachedDomainsByAccount[accountId])
            return this.cachedDomainsByAccount[accountId];

        const networkId = this.getDomainNetwork();
        if(networkId == null)
            return null;

        const result = await desk.networkRequest({ networkId: networkId, action: 'getDefaultDomain', accountId });    
        if(result.success)
        {
            this.cachedDomainsByAccount[accountId] = result.domain;
            return result.domain;
        }
        else
            return null;
    }
    

    getDomainNetwork()
    {
        for(const [networkId, network] of Object.entries(desk.availableNetworks))
        {
            if(network.name.webName == 'name')
                return networkId;
        }
        return null;
    }
}