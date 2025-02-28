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

        const result = await desk.networkRequest({ networkId: networkId, method: 'lookupDomain', domainName: name });    
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
        if(accountId in this.cachedDomainsByAccount)
            return this.cachedDomainsByAccount[accountId];

        const networkId = this.getDomainNetwork();
        if(networkId == null)
        {
            this.cachedDomainsByAccount[accountId] = null;
            return null;
        }

        const result = await desk.networkRequest({ networkId: networkId, method: 'getDefaultDomain', accountId });    
        if(result.success)
        {
            this.cachedDomainsByAccount[accountId] = result.domain;
            return result.domain;
        }
        else
        {
            this.cachedDomainsByAccount[accountId] = null;
            return null;
        }
    }

    clearCache()
    {
        this.cachedDomainsByAccount = {};
        this.cachedDomainsByName = {};
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