/**
 * dashboard.js - A generic split-screen terminal runner
 * usage: require('./dashboard').start([ ...commands ])
 */
const blessed = require('blessed');
const { spawn } = require('child_process');

/**
 * @typedef {Object} CommandConfig
 * @property {string} cmd Command to run
 * @property {Array<string>} [args] Command arguments
 * @property {string} [title] Title for the command box
 */

/**
 * Starts the dashboard with the given commands
 * @param {Array<string|CommandConfig>} commands Array of command strings or config objects
 */
function splitRun(commands) {
    // 1. Setup Screen
    const screen = blessed.screen({
        smartCSR: true,
        title: 'Command Dashboard',
        dockBorders: true,
        mouse: true
    });

    // 2. Helper to parse command input
    // Supports strings: "ping google.com"
    // Supports objects: { cmd: 'ping', args: ['google.com'], title: 'My Ping' }
    const configs = commands.map((item, index) => {
        if(typeof item === 'string') {
            const parts = item.split(' ');
            return {
                cmd: parts[0],
                args: parts.slice(1),
                title: item
            };
        }
        return {
            cmd: item.cmd,
            args: item.args || [],
            title: item.title || `Command ${index + 1}`
        };
    });

    const boxes = [];

    // 3. Create Columns
    configs.forEach((config, i) => {
        const widthPercent = Math.floor(100 / configs.length);

        const box = blessed.box({
            top: 0,
            left: `${i * widthPercent}%`,
            width: `${widthPercent}%`,
            height: '100%',
            label: ` ${config.title} `,
            content: '',
            tags: true,
            keys: true,
            mouse: true,
            border: { type: 'line' },
            style: {
                fg: 'white',
                border: { fg: '#f0f0f0' },
                focus: { border: { fg: 'green' } }
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: { ch: ' ', bg: 'blue' }
        });

        boxes.push(box);
        screen.append(box);

        // Bind Restart Key
        box.key('r', () => spawnInBox(box, config, screen));

        // Initial Start
        spawnInBox(box, config, screen);
    });

    // 4. Navigation & Global Keys
    if(boxes.length > 0) boxes[0].focus();

    screen.key(['tab', 'right'], () => { screen.focusNext(); screen.render(); });
    screen.key(['S-tab', 'left'], () => { screen.focusPrevious(); screen.render(); });
    screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

    // 5. Help Footer
    const tip = blessed.box({
        bottom: 0, right: 0, height: 1, width: 'shrink',
        content: ' [TAB] Next | [Arrows] Scroll | [r] Restart | [q] Quit ',
        style: { bg: 'blue', fg: 'white' }
    });
    screen.append(tip);

    screen.render();
}

/**
 * Handles the process spawning, logging, and restarting logic
 */
function spawnInBox(box, config, screen) {
    // Cleanup previous process
    if(box.activeProcess) {
        try{ box.activeProcess.kill(); }
        catch(_e) { _e /* Ignore */ }
        box.pushLine('{yellow-fg}--- RESTARTING ---{/}');
    }
    else
        box.setContent('');
    

    box.border.fg = 'green';
    screen.render();

    const write = (msg) => {
    // Smart Scroll Logic: Only auto-scroll if already at bottom
        const isAtBottom = box.childBase + box.height >= box.getScrollHeight();
        box.pushLine(msg);
        if(isAtBottom) box.setScrollPerc(100);
    };

    try{
        const child = spawn(config.cmd, config.args, { shell: false }); 
        box.activeProcess = child;

        child.stdout.on('data', d => { write(d.toString().trim()); screen.render(); });
        child.stderr.on('data', d => { write(`{red-fg}${d.toString().trim()}{/}`); screen.render(); });

        child.on('close', (code) => {
            box.activeProcess = null;
            box.border.fg = '#f0f0f0';
            write(code === 0 ? '{green-fg}Done (0){/}' : `{red-fg}Exit (${code}){/}`);
            screen.render();
        });

        child.on('error', (err) => {
            write(`{red-fg}Failed to start: ${err.message}{/}`);
            screen.render();
        });

    }
    catch(e) {
        write(`{red-fg}Error: ${e.message}{/}`);
    }
}

module.exports = { splitRun };