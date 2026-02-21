const exports = {};

// http://localhost:3101/tools/canvas/1318
// tools.oc.edu/tools/canvas/1318
// https://toolsdev.oc.edu/


// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

exports.modules = async (req, res) => {
    // Get courseId from params at the start of the function
    const courseId = req.params.courseId;

    try {
        if (!courseId) {
            return res.status(400).send({ message: "Course ID is required" });
        }

        // Validate course ID is a positive integer
        if (courseId === '' || isNaN(courseId) || !Number.isInteger(Number(courseId)) || Number(courseId) <= 0) {
            return res.status(400).json({ error: 'Invalid course ID: must be a positive integer' });
        }

        console.log(`Course ID: ${courseId}`);

        // Check cache first
        const cacheKey = `modules-${courseId}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('Returning cached data');
            // Set HTML content type and return HTML from cache
            res.setHeader('Content-Type', 'text/html');
            const htmlResponse = generateModuleHTML(cached.data, courseId);
            return res.send(htmlResponse);
        }

        const canvasDomain = (process.env.CANVAS_DOMAIN || 'https://oklahomachristian.beta.instructure.com');
        const apiToken = process.env.CANVAS_API_TOKEN;

        if (!apiToken) {
            return res.status(500).json({ error: 'Canvas API token not configured' });
        }

        let allModules = [];
        let url = `${canvasDomain}/api/v1/courses/${courseId}/modules?per_page=100`;

        while (url) {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(12000) // 12 second timeout
            });

            if (!response.ok) throw new Error('Failed to fetch modules');

            const modules = await response.json();
            allModules = allModules.concat(modules);

            // Check for next page in Link header
            const linkHeader = response.headers.get('Link');
            url = null;
            if (linkHeader) {
                const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
                if (nextLink) {
                    url = nextLink.match(/<(.*?)>/)[1];
                }
            }
        }

        console.log('First module:', allModules[0]);

        // Transform to only include id and name for published modules only
        const simplifiedModules = allModules.filter(module => module.published).map((module) => ({
            id: module.id,
            name: module.name
        }));

        // Store in cache
        cache.set(cacheKey, {
            data: simplifiedModules,
            timestamp: Date.now()
        });

        // Set HTML content type and return HTML
        res.setHeader('Content-Type', 'text/html');
        const htmlResponse = generateModuleHTML(simplifiedModules, courseId);
        res.send(htmlResponse);

    } catch (error) {
        console.error(`Failed to fetch modules for course ${courseId}:`, error);
        res.status(500).json({
            error: 'Failed to fetch modules',
            details: error.message,
            courseId: courseId
        });
    }
};

exports.modules2 = async (req, res) => {
    const moduleId = req.params.moduleId;
    const courseId = req.params.courseId;

    if (!moduleId || !courseId) {
        return res.status(400).send({ message: "Module ID and Course ID are required" });
    }

    console.debug(`Fetching module ${moduleId} items for course ${courseId}`);

    // Check cache first
    const cacheKey = `module-items-${courseId}-${moduleId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('Returning cached module items');
        return res.send(cached.data);
    }

    try {
        const canvasDomain = (process.env.CANVAS_DOMAIN || 'https://oklahomachristian.beta.instructure.com');
        const apiToken = process.env.CANVAS_API_TOKEN;

        if (!apiToken) {
            return res.status(500).json({ error: 'Canvas API token not configured' });
        }

        const itemsUrl = `${canvasDomain}/api/v1/courses/${courseId}/modules/${moduleId}/items`;
        const response = await fetch(itemsUrl, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) throw new Error('Failed to fetch module items');

        const items = await response.json();

        // Store in cache
        cache.set(cacheKey, {
            data: items,
            timestamp: Date.now()
        });

        // Generate HTML for items
        const htmlResponse = generateModuleItemsHTML(items, courseId, moduleId);
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlResponse);

    } catch (error) {
        console.error(`Failed to fetch module items: ${error}`);
        res.status(500).json({ error: 'Failed to fetch module items' });
    }
};


exports.modules2Json = async (req, res) => {
    const moduleId = req.params.moduleId;
    const courseId = req.params.courseId;

    if (!moduleId || !courseId) {
        return res.status(400).send({ message: "Module ID and Course ID are required" });
    }

    console.debug(`Fetching module ${moduleId} items for course ${courseId}`);

    // Check cache first
    const cacheKey = `module-items-${courseId}-${moduleId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('Returning cached module items');
        return res.json(cached.data);
    }

    try {
        const canvasDomain = (process.env.CANVAS_DOMAIN || 'https://oklahomachristian.beta.instructure.com');
        const apiToken = process.env.CANVAS_API_TOKEN;

        if (!apiToken) {
            return res.status(500).json({ error: 'Canvas API token not configured' });
        }

        const itemsUrl = `${canvasDomain}/api/v1/courses/${courseId}/modules/${moduleId}/items`;
        const response = await fetch(itemsUrl, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) throw new Error('Failed to fetch module items');

        const items = await response.json();
        const publishedItems = items.filter(item => item.published !== false);

        // Store in cache
        cache.set(cacheKey, {
            data: publishedItems,
            timestamp: Date.now()
        });

        // Return JSON instead of HTML
        res.json(publishedItems);

    } catch (error) {
        console.error(`Failed to fetch module items: ${error}`);
        res.status(500).json({ error: 'Failed to fetch module items' });
    }
};

// Helper function to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}




function generateModuleHTML(modules, classId) {
  const timestamp = Date.now();
  return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Poppins', 'Segoe UI', sans-serif; 
            background-color: #f9f9f9; 
            padding: 1.25rem; 
            margin: 0;
        }
        .modules-container {
            max-width: 87.5rem;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(12.5rem, 1fr));
            gap: 0.5rem;
        }
        @media (max-width: 48rem) {
            .modules-container {
                grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
                gap: 0.375rem;
                padding: 0 1rem;
                max-width: 100%;
            }
            .module-card {
                width: auto !important;
                height: 8.75rem !important;
                margin-bottom: 0;
            }
            .module-header {
                padding: 0.75rem;
            }
            .module-title {
                font-size: 2rem !important;
            }
        }
        @media (max-width: 26rem) {
            .modules-container {
                grid-template-columns: 1fr;
                gap: 0.375rem;
                padding: 0 1.25rem;
                max-width: 100%;
            }
            .module-card {
                height: 7.5rem !important;
            }
            .module-header {
                padding: 0.625rem;
            }
            .module-title {
                font-size: 1.875rem !important;
            }
        }
        /* iPhone XR (414px) and SE (375px) specific */
        @media (max-width: 414px) {
            .modules-container {
                grid-template-columns: repeat(2, 1fr);
                gap: 0.375rem;
                padding: 0 0.75rem;
            }
            .module-card {
                height: 3.5rem !important;
            }
            .module-card.expanded {
                height: auto !important;
                width: 100% !important;
                grid-column: 1 / -1;
            }
            .module-title {
                font-size: 0.75rem !important;
            }
        }
        .module-card { 
            background: white; 
            border: 2px solid #811429; 
            border-radius: 0.375rem; 
            margin-bottom: 0.75rem;
            transition: all 0.2s;
            box-shadow: 0 1px 3px rgba(39,108,108,0.1);
            cursor: pointer;
            width: 12.5rem;
            height: 3.75rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        .module-card:hover { 
            background: #f8f9fa; 
            border-color: #522c;
            box-shadow: 0 2px 6px rgba(39,108,108,0.15);
        }
        .module-header {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            padding: 16px;
            cursor: pointer;
        }
        .module-title {
            font-family: 'Poppins', sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: #811429;
        }
        .module-arrow {
            font-size: 12px;
            color: #811429;
            transition: transform 0.2s;
        }
        .module-card.expanded .module-arrow {
            transform: rotate(90deg);
        }
        .module-items {
            display: none;
            border-top: 1px solid #eee;
            background: #fafafa;
            width: 100%;
        }
        .module-card.expanded .module-items {
            display: block;
        }
        .module-card.expanded {
            width: 100%;
            height: auto;
        }
        .items-card { 
            padding: 16px;
        }
        .item-divider {
            height: 1px;
            background-color: #eee;
            margin: 12px 0;
        }
        .item-link {
            color: #811429;
            text-decoration: none;
            font-weight: 500;
            display: block;
            padding: 8px 0;
        }
        .item-link:hover {
            text-decoration: underline;
        }
        .item-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            padding: 8px 0;
            cursor: default;
            pointer-events: none;
        }
        h1 {
            font-family: 'Bebas Neue', 'Poppins', sans-serif;
            color: #811429;
            margin-bottom: 24px;
            text-align: center;
            font-size: 32px;
            letter-spacing: 1px;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        @media (max-width: 768px) {
            .modules-container {
                padding: 0;
            }
            .module-card {
                margin-bottom: 8px;
            }
            .module-header {
                padding: 12px;
            }
            .module-title {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <h1>Course Modules</h1>
    <div class="modules-container">
        ${modules.map((module) => `
            <div class="module-card" data-module-id="${module.id}" data-course-id="${classId}">
                <div class="module-header">
                    <div class="module-title">${module.name}</div>
                </div>
                <div class="module-items">
                    <div class="loading">Loading module items...</div>
                </div>
            </div>
        `).join('')}
    </div>
    
    <script>
        window.addEventListener('load', function() {
            // Force mobile styles if needed
            if (window.innerWidth <= 414) {
                document.querySelectorAll('.module-card').forEach(card => {
                    card.style.height = '7.5rem';
                    card.querySelector('.module-title').style.fontSize = '1.875rem';
                });
                document.querySelector('.modules-container').style.gridTemplateColumns = '1fr';
            }
            
            const moduleCards = document.querySelectorAll('.module-card');
            
            moduleCards.forEach(card => {
                card.addEventListener('click', function(e) {
                    // Only toggle if clicking the header, not links inside
                    if (!e.target.closest('.item-link')) {
                        toggleModule(this);
                    }
                });
            });
            
            function toggleModule(card) {
                const isExpanded = card.classList.contains('expanded');
                
                // Close all other modules
                moduleCards.forEach(otherCard => {
                    if (otherCard !== card) {
                        otherCard.classList.remove('expanded');
                    }
                });
                
                if (!isExpanded) {
                    card.classList.add('expanded');
                    loadModuleItems(card);
                } else {
                    card.classList.remove('expanded');
                }
            }
            
            async function loadModuleItems(card) {
                const moduleId = card.dataset.moduleId;
                const courseId = card.dataset.courseId;
                const itemsContainer = card.querySelector('.module-items');
                
                try {
                    const response = await fetch(\`/tools/canvas/\${courseId}/module/\${moduleId}/items?t=\${Date.now()}\`);
                    if (!response.ok) throw new Error('Failed to load module items');
                    
                    const contentType = response.headers.get('content-type');
                    let items;
                    
                    if (contentType && contentType.includes('application/json')) {
                        items = await response.json();
                    } else {
                        // If we get HTML, it means the endpoint is returning HTML instead of JSON
                        // We need to create a separate JSON endpoint
                        throw new Error('Endpoint returned HTML instead of JSON');
                    }
                    
                    itemsContainer.innerHTML = \`
                        <div class="items-card">
                            \${items.map((item, index) => \`
                                \${item.type === 'SubHeader' ? 
                                    \`<div class="item-title">\${item.title}</div>\` :
                                    \`\${item.html_url || item.url ? \`<a href="\${item.html_url || item.url}" class="item-link" target="_blank">\${item.title}</a>\` : \`<div class="item-title">\${item.title}</div>\`}
                                \`}
                                \${index < items.length - 1 ? '<div class="item-divider"></div>' : ''}
                            \`).join('')}
                        </div>
                    \`;
                } catch (error) {
                    itemsContainer.innerHTML = '<div class="loading">Failed to load module items</div>';
                }
            }
        });
    </script>
</body>
</html>`;
}

function generateModuleItemsHTML(items, courseId, moduleId) {
  return `
    < !DOCTYPE html >
        <html>
            <head>
                <style>
                    body {
                        font - family: 'Poppins', 'Segoe UI', sans-serif;
                    background-color: #f9f9f9;
                    padding: 20px;
                    margin: 0;
        }
                    .items-container {
                        max - width: 1200px;
                    margin: 0 auto;
        }
                    .items-card {
                        background: white;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    padding: 16px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
                    .item-divider {
                        height: 1px;
                    background-color: #eee;
                    margin: 12px 0;
        }
                    .item-link {
                        color: #811429;
                    text-decoration: none;
                    font-weight: 500;
                    display: block;
                    padding: 8px 0;
        }
                    .item-link:hover {
                        text - decoration: underline;
        }
                    .item-title {
                        font - size: 16px;
                    font-weight: 600;
                    color: #333;
                    padding: 8px 0;
                    cursor: default;
                    pointer-events: none;
        }
                    h1 {
                        font - family: 'Bebas Neue', 'Poppins', sans-serif;
                    color: #811429;
                    margin-bottom: 24px;
                    text-align: center;
                    font-size: 32px;
                    letter-spacing: 1px;
        }
                    .back-link {
                        color: #811429;
                    text-decoration: none;
                    font-weight: 500;
                    margin-bottom: 20px;
                    display: inline-block;
        }
                    .back-link:hover {
                        text - decoration: underline;
        }
                </style>
            </head>
            <body>
                <h1>Module Items</h1>
                <a href="/api/${courseId}" class="back-link">← Back to Modules</a>
                <div class="items-container">
                    <div class="items-card">
                        ${items.map((item, index) => `
                ${item.type === 'SubHeader' ?
                                `<div class="item-title">${item.title}</div>` :
                                `${item.html_url || item.url ? `<a href="${item.html_url || item.url}" class="item-link" target="_blank">${item.title}</a>` : `<div class="item-title">${item.title}</div>`}
                `}
                ${index < items.length - 1 ? '<div class="item-divider"></div>' : ''}
            `).join('')}
                    </div>
                </div>
            </body>
        </html>`;
}


export default exports;
