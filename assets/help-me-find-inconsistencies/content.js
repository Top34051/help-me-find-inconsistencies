(() => {
    // State management
    let currentSessionId = null;
    let websocket = null;
    let claims = [];
    let sidebar = null;
    let sidebarVisible = true;
    let isResizing = false;
    let initialX = 0;
    let initialWidth = 0;

    // At the top of your file, determine the protocol based on the current page
    const API_BASE_URL = 'https://inconsistency.genie.stanford.edu/api';
    const WS_BASE_URL = 'wss://inconsistency.genie.stanford.edu/ws';

    function createSidebar() {
        const existingSidebar = document.getElementById('wiki-highlighter-sidebar');
        if (existingSidebar) {
            return existingSidebar;
        }

        const sidebar = document.createElement('div');
        sidebar.id = 'wiki-highlighter-sidebar';
        sidebar.style.transform = 'translateX(0)';  // Initialize transform
        sidebar.innerHTML = `
            <div class="resize-handle"></div>
            <div class="session-info">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div id="analysis-status">Initializing...</div>
                    <button id="minimize-sidebar" style="margin-left: auto;">−</button>
                </div>
                <div id="analysis-substatus"></div>
                <div id="progress-container">
                    <div id="progress-bar"></div>
                </div>
            </div>
            <div class="sidebar-content"></div>
        `;

        document.body.appendChild(sidebar);

        // Create a toggle button that appears when sidebar is minimized
        const toggleButton = document.createElement('button');
        toggleButton.id = 'show-sidebar-button';
        toggleButton.textContent = 'Show Inconsistencies';
        toggleButton.style.display = 'none';
        document.body.appendChild(toggleButton);

        toggleButton.addEventListener('click', () => {
            sidebar.style.transform = 'translateX(0)';  // Show sidebar
            toggleButton.style.display = 'none';
            sidebarVisible = true;
        });

        document.getElementById('minimize-sidebar').addEventListener('click', () => {
            sidebar.style.transform = 'translateX(100%)';  // Hide sidebar
            toggleButton.style.display = 'block';
            sidebarVisible = false;
        });

        // Add resize functionality
        const resizeHandle = sidebar.querySelector('.resize-handle');

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            initialX = e.clientX;
            initialWidth = parseInt(window.getComputedStyle(sidebar).width, 10);

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        function handleMouseMove(e) {
            if (!isResizing) return;

            const deltaX = initialX - e.clientX;
            const newWidth = Math.max(250, initialWidth + deltaX); // Set minimum width to 250px

            sidebar.style.width = `${newWidth}px`;
        }

        function handleMouseUp() {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        }

        return sidebar;
    }
    function updateProgress(status, progress) {
        const statusElement = document.getElementById('analysis-status');
        const subStatusElement = document.getElementById('analysis-substatus');
        const progressBar = document.getElementById('progress-bar');

        if (statusElement) {
            let statusText = "Unknown Status";
            let subStatusText = "";

            switch (status) {
                case "initiated":
                    statusText = "Analysis initiated...";
                    break;
                case "extracting_content":
                    statusText = "Extracting content from Wikipedia page...";
                    break;
                case "extracting_claims":
                    statusText = "Extracting statements from content...";
                    break;
                case "analyzing_claims":
                    const analyzedCount = claims.filter(c => (c.status !== "analyzing") && (c.status !== "extracted")).length;
                    const totalCount = claims.length;
                    statusText = `Analyzing statements for inconsistencies... (${analyzedCount}/${totalCount})`;
                    break;
                case "loading_from_db":
                    statusText = "Loading previously analyzed statements...";
                    break;
                case "completed":
                    const inconsistentCount = claims.filter(c => c.status === "inconsistent").length;
                    statusText = "Analysis completed!";
                    subStatusText = `Found ${inconsistentCount} potential inconsistencies in this page.`;
                    break;
                case "error":
                    statusText = "Error occurred during analysis";
                    break;
            }

            statusElement.textContent = statusText;
            subStatusElement.textContent = subStatusText;
        }

        if (progressBar) {
            progressBar.style.width = `${progress * 100}%`;
        }
    }

    function addClaimToSidebar(claim) {
        // Only add if not already present
        if (document.querySelector(`.sidebar-term[data-claim-id="${claim.id}"]`)) {
            return null;
        }

        // Don't add consistent claims to the sidebar
        if (claim.status === 'consistent') {
            return null;
        }

        const sidebarContent = document.querySelector('.sidebar-content');
        const claimElement = document.createElement('div');
        claimElement.className = 'sidebar-term';
        claimElement.setAttribute('data-claim-id', claim.id);
        claimElement.setAttribute('data-claim-status', claim.status);
        claimElement.style.cursor = 'pointer'; // Add pointer cursor to indicate clickability

        // Store the position in the document for scrolling
        if (claim.position) {
            claimElement.setAttribute('data-position', claim.position);
        }

        const reportContent = claim.report ?
            `<div class="term-description">${claim.report}</div>` :
            '<div class="term-description">Analyzing claim...</div>';

        claimElement.innerHTML = `
            <div class="term-header">
                <span class="status-badge status-${claim.status}">${claim.status}</span>
                <span class="term-text">${claim.text}</span>
            </div>
            ${reportContent}
            <div class="feedback-box" style="display: none;">
                <div class="feedback-question" style="text-align: left;">Is this statement actually inconsistent?</div>
                <div class="feedback-buttons" style="justify-content: flex-start;">
                    <div class="helpful-button" data-claim-id="${claim.id}" data-response="yes">
                        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;" data-response="yes">
                            <circle cx="12" cy="12" r="10" stroke="#4caf50" stroke-width="1" fill="white" data-response="yes"/>
                            <path d="M8 12L11 15L16 9" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-response="yes"/>
                        </svg>
                        Yes
                    </div>
                    <div class="helpful-button" data-claim-id="${claim.id}" data-response="no">
                        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;" data-response="no">
                            <circle cx="12" cy="12" r="10" fill="#f5f5f5" stroke="#ccc" stroke-width="1" data-response="no"/>
                            <line x1="8" y1="12" x2="16" y2="12" stroke="#999" stroke-width="2" stroke-linecap="round" data-response="no"/>
                        </svg>
                        No
                    </div>
                </div>
            </div>
            <div class="thank-you-box" style="display: none;">Thank you for your feedback!</div>
        `;

        claimElement.addEventListener('click', (e) => {
            // Skip if clicking on feedback buttons
            if (e.target.closest('.helpful-button')) {
                return;
            }

            // Clear any previous highlights in sidebar
            document.querySelectorAll('.sidebar-term.highlighted').forEach(term => {
                term.classList.remove('highlighted');
            });

            // Highlight this term in the sidebar
            claimElement.classList.add('highlighted');

            const description = claimElement.querySelector('.term-description');
            description.classList.toggle('visible');

            // Toggle the feedback box along with the description
            const feedbackBox = claimElement.querySelector('.feedback-box');
            const thankYouBox = claimElement.querySelector('.thank-you-box');

            // Only show feedback box if description is visible AND thank you box is not already shown
            if (description.classList.contains('visible')) {
                feedbackBox.style.display = 'block';
            } else {
                feedbackBox.style.display = 'none';
            }

            if (claim.status === 'inconsistent') {
                document.querySelectorAll(`.highlight[data-claim-id="${claim.id}"]`).forEach(el => {
                    el.classList.toggle('active');
                });
            }

            // Go to the claim in the page
            const highlights = document.querySelectorAll(`.highlight[data-claim-id="${claim.id}"]`);
            if (highlights.length > 0) {
                // Scroll to the first highlight
                highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Highlight all instances in the page
                document.querySelectorAll('.highlight.active').forEach(h => {
                    h.classList.remove('active');
                });

                highlights.forEach(h => {
                    h.classList.add('active');
                });
            }
        });

        // Add helpful button event listener
        claimElement.querySelectorAll('.helpful-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const claimId = e.currentTarget.getAttribute('data-claim-id');
                const response = e.currentTarget.getAttribute('data-response');

                giveFeedback(claimId, response);

                const thankYouBox = claimElement.querySelector('.thank-you-box');
                thankYouBox.style.display = 'block';
                if (response === 'yes') {
                    thankYouBox.textContent = `Thank you for confirming the inconsistency!`;
                    thankYouBox.style.backgroundColor = '#e3f2fd';
                    thankYouBox.style.color = '#1565c0';
                } else {
                    thankYouBox.textContent = `Got it! Thank you for helping us improve.`;
                    thankYouBox.style.backgroundColor = '#e3f2fd';
                    thankYouBox.style.color = '#1565c0';
                }
            });
        });

        sidebarContent.appendChild(claimElement);

        // Sort claims to prioritize "inconsistent" ones and maintain document order
        sortClaimsInSidebar();

        return claimElement;
    }

    function sortClaimsInSidebar() {
        const sidebarContent = document.querySelector('.sidebar-content');
        if (!sidebarContent) return;

        const claimElements = Array.from(sidebarContent.querySelectorAll('.sidebar-term'));

        // Sort the elements: inconsistent first, then by position in document
        claimElements.sort((a, b) => {
            const statusA = a.getAttribute('data-claim-status');
            const statusB = b.getAttribute('data-claim-status');
            const positionA = parseInt(a.getAttribute('data-position')) || 999999;
            const positionB = parseInt(b.getAttribute('data-position')) || 999999;

            // First sort by status (inconsistent first)
            if (statusA === 'inconsistent' && statusB !== 'inconsistent') {
                return -1;
            } else if (statusA !== 'inconsistent' && statusB === 'inconsistent') {
                return 1;
            }

            // Then sort by position in document
            return positionA - positionB;
        });

        // Remove all elements and re-append in sorted order
        claimElements.forEach(element => {
            sidebarContent.appendChild(element);
        });
    }

    function giveFeedback(claimId, response) {
        if (!currentSessionId) return;

        fetch(`${API_BASE_URL}/feedback/${currentSessionId}/${claimId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response: response
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Feedback given:', data);
            })
            .catch(error => {
                console.error('Error giving feedback:', error);
            });
    }

    function updateClaimInSidebar(claim) {
        // If the claim is now consistent, remove it from the sidebar
        if (claim.status === 'consistent') {
            const claimElement = document.querySelector(`.sidebar-term[data-claim-id="${claim.id}"]`);
            if (claimElement) {
                claimElement.remove();
            }
            return null;
        }

        const claimElement = document.querySelector(`.sidebar-term[data-claim-id="${claim.id}"]`);
        if (!claimElement) {
            return addClaimToSidebar(claim);
        }

        claimElement.setAttribute('data-claim-status', claim.status);
        const statusBadge = claimElement.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.textContent = claim.status;
            statusBadge.className = `status-badge status-${claim.status}`;
        }

        const descriptionElement = claimElement.querySelector('.term-description');
        if (descriptionElement && claim.report) {
            descriptionElement.innerHTML = claim.report;
        }

        // If the claim is now inconsistent, highlight it in the page
        if (claim.status === 'inconsistent') {
            highlightClaimInPage(claim);
        }

        // Re-sort claims when status changes
        sortClaimsInSidebar();

        return claimElement;
    }

    function findParagraphsWithText(container, text) {
        const paragraphs = container.querySelectorAll('p');
        const matchingParagraphs = [];

        paragraphs.forEach(paragraph => {
            const paragraphText = paragraph.textContent || paragraph.innerText || '';
            if (paragraphText.toLowerCase().includes(text.toLowerCase())) {
                matchingParagraphs.push(paragraph);
            }
        });

        return matchingParagraphs;
    }

    function highlightClaimInPage(claim) {
        const articleContent = document.getElementById('mw-content-text');
        if (!articleContent) return;

        function highlightText(element, searchText, claimId) {
            const instance = new Mark(element);
            let count = 0;
            let firstPosition = null;

            instance.mark(searchText, {
                element: "span",
                className: "highlight",
                acrossElements: true,
                caseSensitive: false,
                separateWordSearch: false,
                ignorePunctuation: [],
                accuracy: {
                    value: "complementary",
                    limiters: [",", ".", ";", ":", "!", "?", "/", "\\", "+", "-", "(", ")", "[", "]", "{", "}", "<", ">", "_", "=", "@", "&", "#"]
                },
                filter: function (textNode, foundTerm, totalCounter) {
                    let parent = textNode.parentNode;
                    while (parent && parent !== element) {
                        if (parent.nodeName.toLowerCase() === 'p') {
                            return true;
                        }
                        parent = parent.parentNode;
                    }
                    return false;
                },
                each: function (markedElement) {
                    markedElement.setAttribute("data-claim-id", claimId);

                    // Store the first position for document ordering
                    if (firstPosition === null) {
                        // Get the Y position relative to the document
                        const rect = markedElement.getBoundingClientRect();
                        firstPosition = rect.top + window.scrollY;

                        // Update the claim with its position
                        const claimIndex = claims.findIndex(c => c.id === claimId);
                        if (claimIndex !== -1) {
                            claims[claimIndex].position = firstPosition;

                            // Update the sidebar element with position
                            const sidebarElement = document.querySelector(`.sidebar-term[data-claim-id="${claimId}"]`);
                            if (sidebarElement) {
                                sidebarElement.setAttribute('data-position', firstPosition);
                            }
                        }
                    }

                    count++;
                }
            });

            return { count, position: firstPosition };
        }

        const highlightingSpan = claim.text_span ? claim.text_span : claim.text;
        const sentences = highlightingSpan.split(/[,.;:!?]/).filter(s => s.trim());
        let totalCount = 0;
        let position = null;

        sentences.forEach(sentence => {
            const trimmedSentence = sentence.trim();
            if (trimmedSentence && trimmedSentence.split(/\s+/).length >= 5) {
                const result = highlightText(articleContent, trimmedSentence, claim.id);
                totalCount += result.count;
                if (position === null && result.position !== null) {
                    position = result.position;
                }
            }
        });

        // After highlighting, resort the sidebar to maintain document order
        sortClaimsInSidebar();

        document.querySelectorAll(`.highlight[data-claim-id="${claim.id}"]`).forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();

                document.querySelectorAll('.highlight.active').forEach(highlight => {
                    if (highlight.getAttribute('data-claim-id') !== el.getAttribute('data-claim-id')) {
                        highlight.classList.remove('active');
                    }
                });

                document.querySelectorAll(`.highlight[data-claim-id="${claim.id}"]`).forEach(highlight => {
                    highlight.classList.toggle('active');
                });

                // Show tooltip with report
                const claimObj = claims.find(c => c.id === claim.id);
                if (claimObj && claimObj.report) {
                    showTooltip(el, claimObj.report);
                }

                // Highlight in sidebar and make sure sidebar is visible
                const sidebarTerm = document.querySelector(`.sidebar-term[data-claim-id="${claim.id}"]`);
                if (sidebarTerm) {
                    // Show sidebar if it's hidden
                    if (!sidebarVisible) {
                        const sidebar = document.getElementById('wiki-highlighter-sidebar');
                        const toggleButton = document.getElementById('show-sidebar-button');
                        if (sidebar && toggleButton) {
                            sidebar.style.transform = 'translateX(0)';  // Show sidebar
                            toggleButton.style.display = 'none';
                            sidebarVisible = true;
                        }
                    }

                    // Clear any previous highlights in sidebar
                    document.querySelectorAll('.sidebar-term.highlighted').forEach(term => {
                        term.classList.remove('highlighted');
                    });

                    // Highlight this term
                    sidebarTerm.classList.add('highlighted');
                    sidebarTerm.querySelector('.term-description').classList.add('visible');
                    sidebarTerm.querySelector('.feedback-box').style.display = 'block';
                    sidebarTerm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        });
    }

    function showTooltip(element, text) {
        const existingTooltip = document.querySelector('.highlight-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'highlight-tooltip';
        tooltip.innerHTML = text;

        const rect = element.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX}px`;
        tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;

        document.body.appendChild(tooltip);

        tooltip.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.stopPropagation();
            }
        });

        document.addEventListener('click', function removeTooltip(e) {
            if (e.target !== element && !e.target.classList.contains('highlight-tooltip') &&
                !e.target.closest('.highlight-tooltip')) {
                tooltip.remove();
                document.removeEventListener('click', removeTooltip);
            }
        });
    }

    function connectWebsocket(sessionId) {
        const wsUrl = `${WS_BASE_URL}/${sessionId}`;

        websocket = new WebSocket(wsUrl);

        websocket.onopen = function () {
            console.log("WebSocket connection established");
        };

        websocket.onmessage = function (event) {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };

        websocket.onerror = function (error) {
            console.error("WebSocket error:", error);
            addErrorMessage("Connection error. Please try again.");
        };

        websocket.onclose = function (event) {
            console.log("WebSocket connection closed:", event.code, event.reason);
        };
    }

    function handleWebSocketMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'initial_state':
                // Handle initial state
                updateProgress(data.status, data.progress);
                if (data.claims && data.claims.length > 0) {
                    data.claims.forEach(claim => {
                        claims.push(claim);
                        // Only add inconsistent claims to sidebar
                        if (claim.status !== 'consistent') {
                            addClaimToSidebar(claim);
                        }
                        if (claim.status === 'inconsistent') {
                            highlightClaimInPage(claim);
                        }
                    });
                }
                break;

            case 'status_update':
                // Handle status and progress updates
                updateProgress(data.status, data.progress);
                break;

            case 'new_claim':
                // Handle new claim
                claims.push(data);
                // Only add non-consistent claims to sidebar
                if (data.status !== 'consistent') {
                    addClaimToSidebar(data);
                }
                break;

            case 'claim_update':
                // Handle claim update
                const index = claims.findIndex(c => c.id === data.id);
                if (index !== -1) {
                    claims[index] = data;
                } else {
                    claims.push(data);
                }
                updateClaimInSidebar(data);

                // Only highlight inconsistent claims after they've been analyzed
                if (data.status === 'inconsistent') {
                    highlightClaimInPage(data);
                }
                break;

            case 'error':
                // Handle error
                addErrorMessage(data.message || "An error occurred");
                break;

            default:
                console.log("Unknown message type:", type, data);
        }
    }

    function addErrorMessage(message) {
        const statusElement = document.getElementById('analysis-status');
        if (statusElement) {
            statusElement.textContent = `Error: ${message}`;
            statusElement.style.color = 'red';
        }
    }

    function startAnalysis() {
        const currentUrl = window.location.href;

        // Add a loading indicator
        sidebar = createSidebar();
        sidebar.classList.add('active');
        sidebarVisible = true;
        updateProgress('initiated', 0);

        fetch(`${API_BASE_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: currentUrl
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                currentSessionId = data.session_id;
                connectWebsocket(currentSessionId);
            })
            .catch(error => {
                console.error('Error starting analysis:', error);
                addErrorMessage(error.message || "Failed to start analysis");
            });
    }

    // Add a button to the Wikipedia interface
    function addAnalysisButton() {
        const pageTools = document.getElementById('p-views') || document.querySelector('.vector-page-tools');

        if (pageTools) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'vector-menu-content';

            const checkButton = document.createElement('button');
            checkButton.textContent = 'Help me find inconsistencies!';
            checkButton.className = 'wiki-inconsistency-check-button';

            checkButton.addEventListener('click', () => {
                // Reset current analysis state
                currentSessionId = null;
                claims = [];
                sidebarVisible = true;

                // Close existing websocket connection if it exists
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                    websocket.close();
                    websocket = null;
                }

                // Clear existing highlights in the page
                document.querySelectorAll('.highlight').forEach(el => {
                    const parent = el.parentNode;
                    if (parent) {
                        parent.innerHTML = parent.innerHTML.replace(/<span class="highlight[^>]*>(.*?)<\/span>/gi, '$1');
                    }
                });

                // Clear sidebar content if it exists
                const sidebarContent = document.querySelector('.sidebar-content');
                if (sidebarContent) {
                    sidebarContent.innerHTML = '';
                }

                // Start new analysis
                startAnalysis();
            });

            buttonContainer.appendChild(checkButton);
            pageTools.appendChild(buttonContainer);
        }
    }

    // Initialize
    function init() {
        addAnalysisButton();
    }

    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();