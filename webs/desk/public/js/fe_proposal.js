
        async function initializeQuill() {
            const toolbarOptions = [
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'header': 1 }, { 'header': 2 }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'script': 'sub'}, { 'script': 'super' }],
                [{ 'indent': '-1'}, { 'indent': '+1' }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                ['link', 'image'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                ['clean']
            ];

            quill = new Quill('#editor-container', {
                modules: {
                    toolbar: toolbarOptions
                },
                theme: 'snow'
            });
            
            quills.set('proposalDescription', quill);
        }
        let governanceData = {'votingPower':0};

        async function fetchStats() {
            const result = await desk.networkRequest({
                networkId: desk.gui.activeNetworkId,
                method: 'getGovernanceStats',
                accountId: desk.wallet.publicKey
            });
            
            if (result.success) {
                governanceData.userVotingPower = result.votingPower;
                document.getElementById('votingPower').textContent = result.votingPower;
                document.getElementById('totalProposals').textContent = result.totalProposals;
                document.getElementById('averageScore').textContent = result.totalProposals ? (parseFloat(result.votingPower)/parseFloat(result.totalProposals)).toFixed(2) : 0;
            }
        }

        async function fetchProposals() {
            const result = await desk.networkRequest({ 
                networkId: desk.gui.activeNetworkId, 
                method: 'getProposals',
                networks: governingNetworks
            });
            if (result.success) {
                displayProposals(result.proposals);
            }
        }

        async function displayProposals(proposals) {
            const container = document.getElementById('proposalList');
            container.innerHTML = '';
            
            for(const proposal of proposals) {
                const div = document.createElement('div');
                div.className = 'proposal-item';
                
                const alreadyVoted = proposal.voters.some(voter => voter.fromAccount == desk.wallet.publicKey);
                const votingHtml = proposal.status == 'active' && !alreadyVoted ? generateVotingInterface(proposal) : '';
                const commentsHtml = await generateCommentsSection(proposal);
                const totalVotingPower = parseFloat(proposal.totalVotingPower);
                const totalVotingScore = parseFloat(proposal.totalVotingScore);
                
                div.innerHTML = `
                    <div class="proposal-header">
                        <h3>${proposal.instruction.title}</h3>
                        <span class="proposal-status">${proposal.status}</span>
                    </div>
                    <div class="metadata">
                        <span>Contribution by: <span class="blockexplorer-link" data-hash="${proposal.account}" data-networkId="${desk.gui.activeNetworkId}">${await desk.gui.resolveAccountId(proposal.account, proposal.account.substring(0, 8)+'...')}</span></span>
                        <span>Created: ${new Date(proposal.timestamp).toLocaleString()}</span>
                        <span>Votes: ${proposal.votes}</span>
                        <span>Score: ${totalVotingPower > 0 ? (totalVotingScore/totalVotingPower) : 0}</span>
                    </div>
                    <div class="proposal-content">${proposal.instruction.description}</div>
                    ${votingHtml}
                    ${commentsHtml}
                `;
                container.appendChild(div);
                
                if(proposal.status == 'active')
                {
                    // Quill the comment editor
                    const toolbarOptions = [
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'header': 1 }, { 'header': 2 }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'script': 'sub'}, { 'script': 'super' }],
                        [{ 'indent': '-1'}, { 'indent': '+1' }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        ['link', 'image'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'align': [] }],
                        ['clean']
                    ];

                    quill = new Quill(`#comment-editor-${proposal.proposalAccount}`, {
                        modules: {
                            toolbar: toolbarOptions
                        },
                        theme: 'snow'
                    });
                    quills.set(`comment-${proposal.proposalAccount}`, quill);
                }
            }
        }

        function generateVotingInterface(proposal) {
            return `
                <div class="voting-criteria">
                    <h4>Vote on this proposal</h4>
                    <div class="voting-power-info">
                        Your current voting power: ${governanceData.userVotingPower} ${!governanceData.userVotingPower ? ' - You can\'t vote yet, contribute first to retrieve voting rights.' : ''}
                    </div>
                    <div class="criteria-row">
                        <span class="criteria-label">Quality of Contribution</span>
                        <span class="criteria-explainer left">Terrible Execution&lt;</span>
                        <div class="slider-container">
                            <input type="range" min="-10" max="10" value="0" 
                                id="quality_${proposal.proposalAccount}" 
                                oninput="updateValue('quality_value_${proposal.proposalAccount}', this.value)">
                            <span class="value-display" id="quality_value_${proposal.proposalAccount}">0</span>
                        </div>
                        <span class="criteria-explainer right">&gt;Fantastic Execution</span>
                    </div>
                    <div class="criteria-row">
                        <span class="criteria-label">Time to Execute</span>
                        <span class="criteria-explainer left">Contribution took no time&lt;</span>
                        <div class="slider-container">
                            <input type="range" min="-10" max="10" value="0" 
                                id="time_${proposal.proposalAccount}"
                                oninput="updateValue('time_value_${proposal.proposalAccount}', this.value)">
                            <span class="value-display" id="time_value_${proposal.proposalAccount}">0</span>
                        </div>
                        <span class="criteria-explainer right">&gt;Contribution took a lot of time</span>
                    </div>
                    <div class="criteria-row">
                        <span class="criteria-label">Benefit to Ecosystem</span>
                        <span class="criteria-explainer left">Harmful or bad to the ecosystem&lt;</span>
                        <div class="slider-container">
                            <input type="range" min="-10" max="10" value="0" 
                                id="benefit_${proposal.proposalAccount}"
                                oninput="updateValue('benefit_value_${proposal.proposalAccount}', this.value)">
                            <span class="value-display" id="benefit_value_${proposal.proposalAccount}">0</span>
                        </div>
                        <span class="criteria-explainer right">&gt;Good for the ecosystem</span>
                    </div>
                    <button class="action-button" onclick="submitVote('${proposal.proposalAccount}', '${proposal.proposalAccount}')">Submit Vote</button>
                </div>
            `;
        }

        async function generateCommentsSection(proposal) {
            let commentsHtml = '';
            for(const comment of proposal.comments) {
                commentsHtml += `
                <div class="comment">
                    <div class="comment-header">
                        <span><span class="blockexplorer-link" data-hash="${comment.account}" data-networkId="${desk.gui.activeNetworkId}">${await desk.gui.resolveAccountId(comment.account, comment.account)}</span></span>
                        <span>${new Date(comment.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="comment-content">${comment.instruction.comment}</div>
                </div>
            `;
            }
            
            const commentsEditor = proposal.status == 'active' ? `
                    <div id="comment-editor-${proposal.proposalAccount}" style="height: 100px; margin: 10px 0;"></div>
                    <button class="action-button" onclick="addComment('${proposal.networkId}', '${proposal.proposalAccount}')">Add Comment</button>` : '';

            if(proposal.status == 'active')
            {
                return `
                    <div class="comments-section">
                        <h4>Comments</h4>
                        <div id="comments_${proposal.proposalAccount}">${commentsHtml}</div>
                        ${commentsEditor}
                    </div>
                `;
            }
            else if(proposal.comments && proposal.comments.length > 0)
            {
                return `
                    <div class="comments-section">
                        <h4>Comments</h4>
                        <div id="comments_${proposal.proposalAccount}">${commentsHtml}</div>
                    </div>
                `;
            }
            
            return '';
        }

        function updateValue(elementId, value) {
            document.getElementById(elementId).textContent = value;
        }

        async function createProposal() {
            const title = document.getElementById('proposalTitle').value;
            const description = quills.get('proposalDescription').root.innerHTML;
            const amount = 0;
            const toAccount = document.getElementById('proposalNetworkSelect').value;

            const instruction = {
                type: 'proposal',
                account: desk.wallet.publicKey,
                toAccount,
                amount,
                title,
                description
            };
            
            const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
            if (sendResult.success) {
                alert('Contribution published successfully');
                fetchProposals();
            }
            else
            {
                alert('Contribution could not be published');
            }
        }

    async function submitVote(targetNetworkId, proposalHash) {
        let quality = parseFloat(document.getElementById(`quality_${proposalHash}`).value);
        let time = parseFloat(document.getElementById(`time_${proposalHash}`).value);
        let benefit = parseFloat(document.getElementById(`benefit_${proposalHash}`).value);

        // Ensure the values are between -10 and +10
        quality = Math.max(-10, Math.min(10, quality));
        time = Math.max(-10, Math.min(10, time));
        benefit = Math.max(-10, Math.min(10, benefit));

        // Calculate the average score
        const averageScore = ((quality + time + benefit) / 3).toFixed(2);

        // Prepare the necessary data for the block
        const amount = 0;
        const toAccount = proposalHash;

        const instruction = {
            type: 'vote',
            account: desk.wallet.publicKey,
            toAccount,
            amount,
            score: averageScore  // Submit the calculated average score
        };

        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            alert('Vote submitted successfully');
            fetchProposals();
        } else {
            alert('Vote could not get submitted');
        }
    }


    async function addComment(targetNetworkId, proposalHash) {
        const message = quills.get(`comment-${proposalHash}`).root.innerHTML;
        const amount = 0;
        const toAccount = proposalHash;

        const instruction = {
            type: 'comment',
            account: desk.wallet.publicKey,
            toAccount,
            amount,
            comment: message
        };
        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            alert('Comment added successfully');
            fetchProposals();
        }
    }
    let governingNetworks = []; 
    let quills = new Map();
    // Initialize
    document.addEventListener('governance-init', function(event) {
        initializeQuill();
        
        governingNetworks = [];
        const networkSelect = document.getElementById('proposalNetworkSelect');
        Object.values(desk.availableNetworks).forEach(network => {
            if(network.name.webName != 'desk' && network.name.webName != 'governance')
            {
                const option = document.createElement('option');
                option.value = network.id;
                option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
                networkSelect.appendChild(option);
                governingNetworks.push(network.id);
            }
        });
        networkSelect.value = networkSelect.childNodes[0].value;
    });
    document.addEventListener('proposal.html-load', function(event) {
        desk.gui.populateNetworkSelect('governance');
        
        fetchStats();
        fetchProposals();
    });