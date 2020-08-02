#!/usr/bin/env node

'use strict';

const {Builder, By, Key, until} = require('selenium-webdriver'); // https://www.npmjs.com/package/selenium-webdriver
const prompts = require('prompts'); // https://www.npmjs.com/package/prompts
const sanitizeFilename = require('sanitize-filename'); // https://www.npmjs.com/package/sanitize-filename

// The following requirements are included in selenium-webdriver:
const seleniumFirefoxOptions = require('selenium-webdriver/firefox').Options; 
const seleniumChromeOptions = require('selenium-webdriver/chrome').Options;

// The following requirements are included in Node.js:
const homeDir = require('os').homedir();
const path = require('path');
const {existsSync, readFileSync, writeFileSync, mkdirSync} = require('fs');
const {exec, execSync, spawnSync} = require('child_process');


// Adjustable Settings (but should not need to be adjusted unless something isn't working properly):
const debugLogging = false;

const defaultBrowserWindowSize = {width: 690, height: 1000}; // Only used for Firefox and Chrome when not Headless (Safari window is not resizable).

const maxTaskAttempts = 3; // Number of times tasks will be attempted if they fail, such as logging in, retrieving Webhooks key, retrieving devices and scenes, and setting up an Applet, etc.

const longWaitForElementTime = 10000; // Generally used when waiting for an element which only gets one chance to show up.
const shortWaitForElementTime = 100; // Generally used when waiting for an element inside a loop with which is given many chances to show up.
const waitForCorrectUrlSleepInLoopTime = 100;

// The next two variables help prevent getting caught in a infinite loop if the URL doesn't get updated properly.
const maxButtonClicksWithIncorrectUrl = 100;
const maxIterationsWithIncorrectUrlAfterButtonNoLongerExists = 100;


// INTERNAL SETTINGS - DO NOT EDIT:

// Values for tasks:
const taskCreateApplets = 'Create Webhooks Applets';
const taskDeleteAppletsNotInBroadLink = 'Delete Webhooks Applets Not in BroadLink';
const taskDeleteApplets = 'Delete Webhooks Applets';
const taskOutputSummary = 'Output Summary';
const taskGenerateHomebridgeIFTTTconfig = 'Generate homebridge-ifttt Configuration';
const taskGenerateJSON = 'Generate JSON Details';
const taskOpenEditAppletURLs = 'Open Edit Applet URLs';
const taskOpenGitHubPage = 'Open "broadlink-webhooks" on GitHub';

// Values for BroadLink/Applet group choices:
const groupDevicesAndScenes = 'Devices and Scenes';
const groupDevicesOnly = 'Devices Only';
const groupScenesOnly = 'Scenes Only';

// Values for multiple option questions:
const optionChange = 'change';
const optionQuit = 'quit';

// Values for different click methods:
const clickMethodSelenium = 0;
const clickMethodEnter = 1; // Try if clickMethodSelenium doesn't work for a button (really only an issue in Safari).
const clickMethodJS = 2; // Try if neither clickMethodSelenium nor clickMethodEnter works for a button (really only an issue in Safari).


let webDriver = null;
let browserToAutomate = null;

(async function broadlink_webhooks() {
    console.info('\nbroadlink-webhooks: Create and Manage IFTTT Webhooks Applets for BroadLink');

    try {
        let versionFromPackageJson = JSON.parse(readFileSync(`${__dirname}/package.json`)).version;
        if (versionFromPackageJson) {
            console.info(`Version ${versionFromPackageJson}\n`);
        } else {
            throw 'NO VERSION KEY';
        }
    } catch (retrieveVersionErrr) {
        console.info(''); // Just for a line break if version retrieval fails.
    }
    
    let userQuit = false;
    try {
        let lastIFTTTusernameUsed = null;
        let lastIFTTTpasswordUsed = null;
        let lastBrowserToAutomate = null;
        
        while (!userQuit) {
            let browserPromptChoices = [
                {title: 'Firefox (Hidden Window / Headless)', value: 'firefox-headless'},
                {title: 'Firefox (Visible Window)', value: 'firefox'},
                {title: '–', value: 'browserSpacer1', disabled: true},
                {title: 'Chrome (Hidden Window / Headless)', value: 'chrome-headless'},
                {title: 'Chrome (Visible Window)', value: 'chrome'},
                {title: '–', value: 'browserSpacer2', disabled: true},
                {title: 'Quit', value: optionQuit}
            ];

            if (process.platform == 'darwin') {
                browserPromptChoices.splice((browserPromptChoices.length - 1), 0,
                    {title: 'Safari (Visible Window)', value: 'safari'},
                    {title: '–', value: 'browserSpacer3', disabled: true}
                );
            }

            let initialBrowserChoiceSelection = 0;
            if (browserToAutomate) {
                for (let thisBrowserChoiceIndex in browserPromptChoices) {
                    let thisBrowserChoice = browserPromptChoices[thisBrowserChoiceIndex];
                    if (browserToAutomate == thisBrowserChoice.value) {
                        initialBrowserChoiceSelection = parseInt(thisBrowserChoiceIndex);
                        break;
                    }
                }
            }

            let optionsPrompts = [
                {
                    type: 'select',
                    name: 'browserSelection',
                    message: 'Choose a Web Browser to Automate (Using Selenium WebDriver):',
                    choices: browserPromptChoices,
                    initial: initialBrowserChoiceSelection
                },
                {
                    type: prev => ((prev == optionQuit) ? null : 'select'),
                    name: 'taskSelection',
                    message: 'Choose a Task:',
                    choices: [
                        {title: 'Create Webhooks Applets', description: 'No duplicates will be created for identical Webhooks Applets already created by "broadlink-webhooks".', value: taskCreateApplets},
                        {title: 'Delete Webhooks Applets for Renamed or Deleted Devices/Scenes in BroadLink', description: 'For renamed devices/scenes, you can re-run the "Create Webhooks Applets" task after this task is finished.', value: taskDeleteAppletsNotInBroadLink},
                        {title: 'Delete All Webhooks Applets Created by "broadlink-webhooks"', description: 'If you ever want the Webhooks Applets back after removing them, you can re-run the "Create Webhooks Applets" task at any time.', value: taskDeleteApplets},
                        {title: '–', value: 'taskSpacer1', disabled: true},
                        {title: 'Output Summary of Webhooks Applets Created by "broadlink-webhooks" and Devices/Scenes in BroadLink', value: taskOutputSummary},
                        {title: 'Generate "homebridge-ifttt" Configuration for Webhooks Applets Created by "broadlink-webhooks"', description: 'Useful only if you use Homebridge. Visit homebridge.io to learn more.', value: taskGenerateHomebridgeIFTTTconfig},
                        {title: 'Generate JSON Details of Webhooks Applets Created by "broadlink-webhooks"', description: 'Useful for your own custom scripts.', value: taskGenerateJSON},
                        {title: 'Open All IFTTT Edit URLs for Webhooks Applets Created by "broadlink-webhooks"', description: 'Edit Applet URLs will open in your default web browser. You should be logged into IFTTT in your default web browser before running this task.', value: taskOpenEditAppletURLs},
                        {title: taskOpenGitHubPage, description: 'To learn more, ask questions, make suggestions, and report issues.', value: taskOpenGitHubPage},
                        {title: '–', value: 'taskSpacer2', disabled: true},
                        {title: 'Change Web Browser Selection', value: optionChange},
                        {title: 'Quit', value: optionQuit}
                    ]
                },
                {
                    type: prev => (((prev == taskOpenGitHubPage) || (prev == optionChange) || (prev == optionQuit)) ? null : 'select'),
                    name: 'groupSelection',
                    message: prev => `Which BroadLink group would you like to ${
                        ((prev == taskCreateApplets) ? 'create Webhooks Applets for' :
                            ((prev == taskDeleteAppletsNotInBroadLink) ? 'delete Webhooks Applets for which have been renamed or deleted in BroadLink' :
                                ((prev == taskDeleteApplets) ? 'delete all Webhooks Applets for' :
                                    ((prev == taskOutputSummary) ? 'output summary for' :
                                        ((prev == taskGenerateHomebridgeIFTTTconfig) ? 'generate "homebridge-ifttt" configuration for' :
                                            ((prev == taskGenerateJSON) ? 'generate JSON details for' :
                                                ((prev == taskOpenEditAppletURLs) ? 'open IFTTT edit Applet URLs for' :
                                                'DO UNKNOWN TASK TO')
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    }?`,
                    choices: [
                        {title: 'Both Devices & Scenes', value: groupDevicesAndScenes},
                        {title: 'Only Devices', value: groupDevicesOnly},
                        {title: 'Only Scenes', value: groupScenesOnly},
                        {title: '–', value: 'groupSpacer1', disabled: true},
                        {title: 'Change Web Browser and Task Selection', value: optionChange},
                        {title: 'Quit', value: optionQuit}
                    ]
                }
            ];

            let optionsPromptsResponse = await prompts(optionsPrompts);
            
            let optionsPromptsResponseValues = Object.values(optionsPromptsResponse);

            if (optionsPromptsResponseValues.includes(optionQuit)) {
                throw 'QUIT';
            } else if (optionsPromptsResponseValues.includes(optionChange)) {
                console.log(''); // Just for a line break before re-displaying options prompt.
                continue;
            } else if (optionsPromptsResponseValues.includes(taskOpenGitHubPage)) {
                let gitHubRepoURL = 'https://github.com/RandomApplications/broadlink-webhooks';
                try {
                    exec(`${((process.platform == 'darwin') ? 'open' : ((process.platform == 'win32') ? 'start' : 'xdg-open'))} ${gitHubRepoURL}`);
                    console.info(`\n\n${taskOpenGitHubPage}: ${gitHubRepoURL}\n\n`);
                } catch (openGitHubRepoURLerror) {
                    console.error(`\n\nERROR OPENING "${gitHubRepoURL}": ${openGitHubRepoURLerror}\n\n`);
                }
                continue;
            } else if (optionsPromptsResponseValues.length < optionsPrompts.length) {
                throw 'CANCELED OPTIONS SELECTION';
            }

            browserToAutomate = optionsPromptsResponse.browserSelection;
            if (lastBrowserToAutomate != browserToAutomate) {
                if (webDriver) {
                    try {
                        await webDriver.quit();
                    } catch (quitWebDriverError) {
                        // Ignore any error quitting WebDriver.
                    }
                }
                
                lastBrowserToAutomate = browserToAutomate;
            }

            let needNewWebDriver = true;
            let iftttLoginURL = 'https://ifttt.com/login?wp_=1';

            try {
                await webDriver.getCurrentUrl(); // If getCurrentUrl() fails, then WebDriver was not built yet, was quit(), or the window was probably closed, so we'll make a new one and log in.
                
                needNewWebDriver = false;
                
                await webDriver.get(iftttLoginURL);

                if ((await webDriver.getCurrentUrl()) == iftttLoginURL) throw 'NEED TO RE-LOG IN';
            } catch (checkForLogInError) {
                let loginPrompts = [
                    {
                        type: 'text',
                        name: 'iftttUsername',
                        message: 'IFTTT Username',
                        initial: lastIFTTTusernameUsed,
                        validate: iftttUsername => ((iftttUsername == '') ? 'IFTTT Username Required' : true)
                    },
                    {
                        type: 'password',
                        name: 'iftttPassword',
                        message: 'IFTTT Password',
                        initial: prev => ((prev == lastIFTTTusernameUsed) ? lastIFTTTpasswordUsed : null),
                        validate: iftttPassword => ((iftttPassword == '') ? 'IFTTT Password Required' : ((iftttPassword.length < 6) ? 'IFTTT Password Too Short' : true))
                    }
                ];
                
                console.log(''); // Just for a line break before login prompts.
                let loginPromptsResponse = await prompts(loginPrompts);
                if (Object.keys(loginPromptsResponse).length < 2) throw 'CANCELED IFTTT LOGIN';
            
                if (needNewWebDriver) {
                    if (webDriver) {
                        try {
                            await webDriver.quit();
                        } catch (quitWebDriverError) {
                            // Ignore any error quitting WebDriver.
                        }
                    }

                    let browserToAutomateParts = browserToAutomate.split('-');
                    let actualBrowserToAutomate = browserToAutomateParts[0];
                    let browserShouldBeHeadless = ((browserToAutomateParts.length > 1) && (browserToAutomateParts[1] == 'headless'));
                    
                    if ((process.platform == 'darwin') && ((actualBrowserToAutomate == 'firefox') || (actualBrowserToAutomate == 'chrome'))) {
                        // Make sure WebDriver executable isn't quarantined on Mac (which could result in "cannot be opened because the developer cannot be verified" error).
                        let webDriverExecutablePath = `/usr/local/bin/${(actualBrowserToAutomate == 'firefox') ? 'gecko' : actualBrowserToAutomate}driver`;

                        try {
                            if (existsSync(webDriverExecutablePath)) {
                                if (spawnSync('xattr', [webDriverExecutablePath]).stdout.toString().includes('com.apple.quarantine')) {
                                    if (debugLogging) console.debug(`DEBUG - "${webDriverExecutablePath}" IS QUARANTINED - ATTEMPTING TO REMOVE QUARANTINE XATTR`);
                                    
                                    execSync(`xattr -d com.apple.quarantine ${webDriverExecutablePath}`);

                                    if (debugLogging) {
                                        if (spawnSync('xattr', [webDriverExecutablePath]).stdout.toString().includes('com.apple.quarantine')) {
                                            console.warn(`DEBUG WARNING - "${webDriverExecutablePath}" IS STILL QUARANTINED`);
                                        } else {
                                            console.debug(`DEBUG - "${webDriverExecutablePath}" IS NO LONGER QUARANTINED`);
                                        }
                                    }
                                } else if (debugLogging) {
                                    console.debug(`DEBUG - "${webDriverExecutablePath}" IS NOT QUARANTINED`);
                                }
                            }
                        } catch (webDriverQuarantineError) {
                            if (debugLogging) console.error(`DEBUG ERROR - FAILED TO CHECK OR REMOVE "${webDriverExecutablePath}" QUARANTINE - ${webDriverQuarantineError}`);
                        }
                    }

                    webDriver = await new Builder().forBrowser(actualBrowserToAutomate).setFirefoxOptions(
                        (browserShouldBeHeadless ?
                            new seleniumFirefoxOptions().headless().windowSize(defaultBrowserWindowSize) :
                            new seleniumFirefoxOptions().windowSize(defaultBrowserWindowSize))
                    ).setChromeOptions(
                        (browserShouldBeHeadless ?
                            new seleniumChromeOptions().headless().windowSize(defaultBrowserWindowSize) :
                            new seleniumChromeOptions().windowSize(defaultBrowserWindowSize)
                        )
                    ).build();
                }

                for (let loginAttemptCount = 1; loginAttemptCount <= maxTaskAttempts; loginAttemptCount ++) {
                    try {
                        await webDriver.get(iftttLoginURL);
                        await check_for_server_error_page();

                        try {
                            await webDriver.wait(until.elementLocated(By.xpath('//h1[text()="Sign in"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
                        
                            await webDriver.wait(
                                until.elementLocated(By.id('user_username')), shortWaitForElementTime
                            ).then(async thisElement => {
                                if (debugLogging) console.debug('DEBUG - Entering IFTTT Username');
                                await thisElement.clear();
                                await thisElement.sendKeys(loginPromptsResponse.iftttUsername);
                            });
    
                            await webDriver.wait(
                                until.elementLocated(By.id('user_password')), shortWaitForElementTime
                            ).then(async thisElement => {
                                if (debugLogging) console.debug('DEBUG - Entering IFTTT Password');
                                await thisElement.clear();
                                await thisElement.sendKeys(loginPromptsResponse.iftttPassword);
                            });
                        } catch (fillSignInPageError) {
                            // Allow sign-in page to error in case the user already signed in and submitted in the web browser.
                        }

                        let currentURL = await webDriver.getCurrentUrl();
                        
                        // IFTTT will first redirect to "https://ifttt.com/session" and then finally to "https://ifttt.com/" OR "https://ifttt.com/my_applets" (depending on user settings) after successfully logging in.
                        while ((currentURL != 'https://ifttt.com/') && (currentURL != 'https://ifttt.com/my_applets')) {
                            if (currentURL == iftttLoginURL) {
                                try {
                                    await webDriver.wait(
                                        until.elementLocated(By.xpath('//input[@value="Sign in"]')), shortWaitForElementTime
                                    ).then(async thisElement => {
                                        if (debugLogging) console.debug('DEBUG - Clicking Sign In Button');
                                        try {
                                            await thisElement.click();
                                        } catch (innerClickSignInButtonError) {
                                            // Ignore likely stale element error and keep looping.
                                        }
                                    });
                                } catch (outerClickSignInButtonError) {
                                    // Ignore likely error from element not existing and keep looping.
                                }
                            } else if (currentURL.startsWith('https://ifttt.com/session/new?email=')) {
                                throw 'INCORRECT IFTTT USERNAME OR PASSWORD';
                            } else if (currentURL == 'https://ifttt.com/session') {
                                try {
                                    await webDriver.wait(
                                        until.elementLocated(By.id('user_tfa_code')), shortWaitForElementTime // Don't wait long for TFA input since it may not exist and we want to keep looping if not.
                                    ).then(async thisElement => {
                                        if (await thisElement.getAttribute('value') == '') { // Make sure we don't prompt again before the page has reloaded.
                                            console.log(''); // Just for a line break before two-step code prompt.
                                            let twoStepPromptResponse = await prompts({
                                                type: 'text',
                                                name: 'iftttTwoStepVerificationCode',
                                                message: 'IFTTT Two-Step Verification Code'
                                            });
                                            
                                            // Allow Two-Step Verification Code prompt to be clicked through without entering a code in case the code was already entered and submitted in the web browser.

                                            if ((Object.keys(twoStepPromptResponse).length == 1) && (twoStepPromptResponse.iftttTwoStepVerificationCode != '')) {
                                                if (debugLogging) console.debug('DEBUG - Entering IFTTT Two-Step Verification Code');
                                                await thisElement.clear();
                                                await thisElement.sendKeys(twoStepPromptResponse.iftttTwoStepVerificationCode);
                                            }
                                        }
                                    });

                                    await webDriver.wait(
                                        until.elementLocated(By.xpath('//input[@value="Sign in"]')), shortWaitForElementTime
                                    ).then(async thisElement => {
                                        if (debugLogging) console.debug('DEBUG - Clicking Two-Step Sign In Button');
                                        try {
                                            await thisElement.click();
                                        } catch (innerIftttTwoStepVerificationError) {
                                            // Ignore likely stale element error and keep looping.
                                        }
                                    });
                                } catch (outerIftttTwoStepVerificationError) {
                                    // Ignore likely error from element not existing and keep looping.
                                }
                            }
                            
                            currentURL = await webDriver.getCurrentUrl();
                            await webDriver.sleep(waitForCorrectUrlSleepInLoopTime);
                        }

                        break;
                    } catch (loginError) {
                        console.error(`\nERROR: ${loginError}`);
                        if (debugLogging) {
                            try {
                                console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                            } catch (getCurrentURLerror) {
                                console.debug('FAILED TO GET CURRENT URL');
                            }
                        }
                        console.error(`\n\nERROR LOGGING INTO IFTTT - ATTEMPT ${loginAttemptCount} OF ${maxTaskAttempts}\n\n`);
                        
                        if (loginAttemptCount == maxTaskAttempts) {
                            throw loginError;
                        } else {
                            if (loginError.toString().includes('INCORRECT IFTTT USERNAME OR PASSWORD')) {
                                loginPrompts[0].initial = loginPromptsResponse.iftttUsername;
                                loginPromptsResponse = await prompts(loginPrompts);
                                if (Object.keys(loginPromptsResponse).length < 2) throw 'CANCELED IFTTT LOGIN';
                            }
                        }
                    }
                }

                lastIFTTTusernameUsed = loginPromptsResponse.iftttUsername;
                lastIFTTTpasswordUsed = loginPromptsResponse.iftttPassword;
            }

            let startTime = new Date();

            console.info(`\nSTARTED "${optionsPromptsResponse.taskSelection}" TASK WITH "${optionsPromptsResponse.groupSelection}" ON ${startTime.toLocaleString().replace(', ', ' AT ')}`);
            
            let iftttWebhooksKey = 'DID_NOT_RETRIEVE_IFTTT_WEBHOOKS_KEY';

            if ((optionsPromptsResponse.taskSelection == taskCreateApplets) || (optionsPromptsResponse.taskSelection == taskGenerateHomebridgeIFTTTconfig) || (optionsPromptsResponse.taskSelection == taskGenerateJSON)) {
                for (let retrieveWebhooksKeyAttemptCount = 1; retrieveWebhooksKeyAttemptCount <= maxTaskAttempts; retrieveWebhooksKeyAttemptCount ++) {
                    try {
                        await webDriver.get('https://ifttt.com/maker_webhooks/settings');
                        await check_for_server_error_page();

                        if ((await webDriver.getCurrentUrl()) == 'https://ifttt.com/maker_webhooks') {
                            // If we got redirected, make sure that the Webhooks Service is connected.
                            try {
                                await webDriver.wait(until.elementLocated(By.xpath('//a[contains(@href,"/maker_webhooks/redirect_to_connect")]')), shortWaitForElementTime);
                                throw '"Webhooks Service" NOT CONNECTED IN IFTTT';
                            } catch (webhooksServiceConnectionError) {
                                if (webhooksServiceConnectionError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                                    throw webhooksServiceConnectionError;
                                }
                                // Otherwise, ignore likely error from element not existing. Which means that the Webhooks Service is connected like we want.
                            }
                        }

                        await webDriver.wait(
                            until.elementLocated(By.xpath('//span[starts-with(text(),"https://maker.ifttt.com/use/")]')), longWaitForElementTime
                        ).then(async thisElement => {
                            if (debugLogging) console.debug('DEBUG - Retrieving IFTTT Webhooks Key');
                            iftttWebhooksKey = (await thisElement.getText()).replace('https://maker.ifttt.com/use/', '');
                        });

                        break;
                    } catch (retrieveWebhooksKeyError) {
                        if (retrieveWebhooksKeyError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                            throw retrieveWebhooksKeyError; // Don't keep trying if service isn't connected.
                        }

                        console.error(`\nERROR: ${retrieveWebhooksKeyError}`);
                        if (debugLogging) {
                            try {
                                console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                            } catch (getCurrentURLerror) {
                                console.debug('FAILED TO GET CURRENT URL');
                            }
                        }
                        console.error(`\n\nERROR RETRIEVING WEBHOOKS KEY - ATTEMPT ${retrieveWebhooksKeyAttemptCount} OF ${maxTaskAttempts}\n\n`);
                        
                        if (retrieveWebhooksKeyAttemptCount == maxTaskAttempts) {
                            throw retrieveWebhooksKeyError;
                        }
                    }
                }
                
                console.info(`\nIFTTT Webhooks Key: ${iftttWebhooksKey}`);
            }

            let existingWebhooksBroadLinkAppletIDsAndNames = [];
            let allowedWebhooksBroadLinkAppletNamePrefixes = [];
            
            if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (optionsPromptsResponse.groupSelection == groupDevicesOnly)) {
                allowedWebhooksBroadLinkAppletNamePrefixes = ['Webhooks Event: BroadLink-On', 'Webhooks Event: BroadLink-Off'];
            }

            if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (optionsPromptsResponse.groupSelection == groupScenesOnly)) {
                allowedWebhooksBroadLinkAppletNamePrefixes.push('Webhooks Event: BroadLink-Scene');
            }

            for (let retrieveExistingWebhooksBroadLinkAppletIDsAndNamesAttemptCount = 1; retrieveExistingWebhooksBroadLinkAppletIDsAndNamesAttemptCount <= maxTaskAttempts; retrieveExistingWebhooksBroadLinkAppletIDsAndNamesAttemptCount ++) {
                try {
                    let totalBroadLinkAppletsDetected = 0;
                    let existingWebhooksBroadLinkOnAppletsCount = 0;
                    let existingWebhooksBroadLinkOffAppletsCount = 0;
                    let existingWebhooksBroadLinkSceneAppletsCount = 0;
                    existingWebhooksBroadLinkAppletIDsAndNames = [];
                    
                    await webDriver.get('https://ifttt.com/broadlink');
                    await check_for_server_error_page();

                    // First, wait a long time for the "discover_services" section (which should always exist) or the "my_services" section (which will only exist if personal Applets exist) because one will always be present no matter what.
                    await webDriver.wait(until.elementsLocated(By.xpath('//section[@class="discover_services" or @class="my_services"]')), longWaitForElementTime);

                    // Next, once we know the page is loaded, wait a short time to get the "my_services" Applet titles (so that it will fail quickly if none exist).
                    try {
                        await webDriver.wait(
                            until.elementsLocated(By.xpath('//section[@class="my_services"]/div/ul[contains(@class,"my-applets")]/li[contains(@class,"my-web-applet-card")]/a[contains(@class,"applet-card-body")]')), shortWaitForElementTime
                        ).then(async theseElements => {
                            totalBroadLinkAppletsDetected = theseElements.length;
                            if (debugLogging) console.debug(`DEBUG - Detected ${totalBroadLinkAppletsDetected} Total BroadLink Applets - Filtering to Only Webhooks Applets for BroadLink`);
                            
                            for (let thisElementIndex in theseElements) {
                                try {
                                    let thisAppletWorksWithPermissionsElement = await theseElements[thisElementIndex].findElement(By.xpath('.//div[@class="meta"]/div[@class="works-with"]/ul[@class="permissions"]'));
                                    let thisAppletTriggerServiceName = await thisAppletWorksWithPermissionsElement.findElement(By.xpath('.//li[1]/img')).getAttribute('title');
                                    
                                    if (thisAppletTriggerServiceName == 'Webhooks') {
                                        let thisAppletActionServiceName = await thisAppletWorksWithPermissionsElement.findElement(By.xpath('.//li[2]/img')).getAttribute('title');
                                        
                                        if (thisAppletActionServiceName == 'BroadLink') { // Since we're on https://ifttt.com/broadlink and the Trigger Service is Webhooks this is an unnecessary check, but better safe than sorry.
                                            let thisBroadLinkAppletName = await theseElements[thisElementIndex].findElement(By.xpath('.//div[@class="content"]/span[contains(@class,"title")]/span/div/div')).getText(); // "title" class had a space after it at the time of writing, which I don't trust to stay forver, so using contains instead of checking if equals "title ".
                                            let thisBroadLinkAppletNameParts = thisBroadLinkAppletName.split('+');
                                            
                                            if ((thisBroadLinkAppletNameParts.length == 2) && allowedWebhooksBroadLinkAppletNamePrefixes.includes(thisBroadLinkAppletNameParts[0]) && !/\s/g.test(thisBroadLinkAppletNameParts[1])) {
                                                let thisAppletURL = await theseElements[thisElementIndex].getAttribute('href');

                                                if (thisAppletURL.includes('/applets/') && thisAppletURL.includes('-webhooks-event-broadlink-')) {
                                                    if (thisAppletURL.includes('-webhooks-event-broadlink-on-')) {
                                                        existingWebhooksBroadLinkOnAppletsCount ++;
                                                    } else if (thisAppletURL.includes('-webhooks-event-broadlink-off-')) {
                                                        existingWebhooksBroadLinkOffAppletsCount ++;
                                                    } else if (thisAppletURL.includes('-webhooks-event-broadlink-scene-')) {
                                                        existingWebhooksBroadLinkSceneAppletsCount ++;
                                                    }

                                                    existingWebhooksBroadLinkAppletIDsAndNames[thisAppletURL.split('/applets/')[1].split('-webhooks-event-broadlink-')[0]] = thisBroadLinkAppletName;
                                                }
                                            }
                                        }
                                    }
                                } catch (getAppletInfoError) {
                                    if (debugLogging) console.debug(`DEBUG ERROR - FAILED TO GET APPLET INFO: ${getAppletInfoError}`);
                                }
                            }
                        });
                    } catch (getExistingBroadLinkAppletsError) {
                        // Ignore error, it's ok if no BroadLink Applets already exist.
                    }

                    if (totalBroadLinkAppletsDetected == 0) {
                        // If we didn't detect any Applets, make sure that the BroadLink Service is connected.
                        try {
                            await webDriver.wait(until.elementLocated(By.xpath('//a[contains(@href,"/broadlink/redirect_to_connect")]')), shortWaitForElementTime);
                            throw '"BroadLink Service" NOT CONNECTED IN IFTTT';
                        } catch (broadLinkServiceConnectionError) {
                            if (broadLinkServiceConnectionError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                                throw broadLinkServiceConnectionError;
                            }
                            // Otherwise, ignore likely error from element not existing. Which means that the BroadLink Service is connected like we want.
                        }
                    }

                    let existingWebhooksBroadLinkTotalAppletsCount = Object.keys(existingWebhooksBroadLinkAppletIDsAndNames).length;
                    let existingWebhooksBroadLinkOnAndOffAndSceneAppletsCount = (existingWebhooksBroadLinkOnAppletsCount + existingWebhooksBroadLinkOffAppletsCount + existingWebhooksBroadLinkSceneAppletsCount);
                    
                    console.info(`\n${existingWebhooksBroadLinkTotalAppletsCount} Existing Webhooks Applet${((existingWebhooksBroadLinkTotalAppletsCount == 1) ? '' : 's')} for BroadLink Detected${(((optionsPromptsResponse.groupSelection != groupDevicesAndScenes) || (existingWebhooksBroadLinkOnAndOffAndSceneAppletsCount > 0)) ?
                        `:\n\t${((optionsPromptsResponse.groupSelection == groupScenesOnly) ?
                            'CHOSE NOT TO DETECT EXISTING WEBHOOKS APPLETS FOR DEVICES' :
                            `${existingWebhooksBroadLinkOnAppletsCount} Turn Device On Applet${((existingWebhooksBroadLinkOnAppletsCount == 1) ? '' : 's')}\n\t${existingWebhooksBroadLinkOffAppletsCount} Turn Device Off Applet${((existingWebhooksBroadLinkOffAppletsCount == 1) ? '' : 's')}`
                        )}\n\t${((optionsPromptsResponse.groupSelection == groupDevicesOnly) ?
                            'CHOSE NOT TO DETECT EXISTING WEBHOOKS APPLETS FOR SCENE' :
                            `${existingWebhooksBroadLinkSceneAppletsCount} Scene Applet${((existingWebhooksBroadLinkSceneAppletsCount == 1) ? '' : 's')}`
                        )}` :
                        ''
                    )}`);
                    
                    if (existingWebhooksBroadLinkTotalAppletsCount != existingWebhooksBroadLinkOnAndOffAndSceneAppletsCount) {
                        console.warn(`WARNING: TOTAL EXISTING APPLETS COUNT (${existingWebhooksBroadLinkTotalAppletsCount}) != ON APPLETS + OFF APPLETS + SCENE APPLETS COUNT (${existingWebhooksBroadLinkOnAndOffAndSceneAppletsCount})`);
                    }

                    break;
                } catch (retrieveExistingWebhooksBroadLinkAppletIDsAndNamesError) {
                    if (retrieveExistingWebhooksBroadLinkAppletIDsAndNamesError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                        throw retrieveExistingWebhooksBroadLinkAppletIDsAndNamesError; // Don't keep trying if service isn't connected.
                    }

                    console.error(`\nERROR: ${retrieveExistingWebhooksBroadLinkAppletIDsAndNamesError}`);
                    if (debugLogging) {
                        try {
                            console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                        } catch (getCurrentURLerror) {
                            console.debug('FAILED TO GET CURRENT URL');
                        }
                    }
                    console.error(`\n\nERROR RETRIEVING EXISTING WEBHOOKS APPLETS FOR BROADLINK - ATTEMPT ${retrieveExistingWebhooksBroadLinkAppletIDsAndNamesAttemptCount} OF ${maxTaskAttempts}\n\n`);
                    
                    if (retrieveExistingWebhooksBroadLinkAppletIDsAndNamesAttemptCount == maxTaskAttempts) {
                        throw retrieveExistingWebhooksBroadLinkAppletIDsAndNamesError;
                    }
                }
            }

            let existingWebhooksBroadLinkAppletNames = Object.values(existingWebhooksBroadLinkAppletIDsAndNames); // Get array of Applet names to be able to easily check if an Applet already exists.

            let currentBroadLinkDeviceNamesArray = [];
            let currentBroadLinkSceneNamesArray = [];

            if ((optionsPromptsResponse.taskSelection == taskCreateApplets) || (optionsPromptsResponse.taskSelection == taskDeleteAppletsNotInBroadLink) || (optionsPromptsResponse.taskSelection == taskOutputSummary)) {
                for (let retrieveDevicesAndScenesAttemptCount = 1; retrieveDevicesAndScenesAttemptCount <= maxTaskAttempts; retrieveDevicesAndScenesAttemptCount ++) {
                    try {
                        await setup_ifttt_webhooks_broadlink_applet('FakeEventName-ToRetrieveRealDeviceAndSceneNames', (optionsPromptsResponse.groupSelection == groupScenesOnly));
                        
                        currentBroadLinkDeviceNamesArray = [];

                        if (optionsPromptsResponse.groupSelection != groupScenesOnly) {
                            await webDriver.wait(until.elementLocated(By.xpath('//select[@name="fields[deviceinfo]"]/option[text()!="Loading…"]')), longWaitForElementTime); // Wait for devices to be loaded.
                            
                            await webDriver.wait(
                                until.elementsLocated(By.xpath('//select[@name="fields[deviceinfo]"]/option')), longWaitForElementTime // Now get all the devices.
                            ).then(async theseElements => {
                                if (debugLogging) console.debug('DEBUG - Retrieving BroadLink Device Names');
                                for (let thisElementIndex in theseElements) {
                                    currentBroadLinkDeviceNamesArray.push(await theseElements[thisElementIndex].getText());
                                }
                            });

                            if ((currentBroadLinkDeviceNamesArray.length == 1) && (currentBroadLinkDeviceNamesArray[0] == 'Options Unavailable')) currentBroadLinkDeviceNamesArray = [];
                            if (currentBroadLinkDeviceNamesArray.length > 1) {
                                currentBroadLinkDeviceNamesArray.sort(function(thisDeviceName, thatDeviceName) {
                                    return thisDeviceName.localeCompare(thatDeviceName);
                                });
                            }

                            console.info(`\n${currentBroadLinkDeviceNamesArray.length} BroadLink Device${((currentBroadLinkDeviceNamesArray.length == 1) ? '' : 's')} Detected`);
                            
                            if (optionsPromptsResponse.groupSelection != groupDevicesOnly) {
                                let currentURL = await webDriver.getCurrentUrl();
                                let nextExpectedSID = (currentURL.includes('sid=') ? (parseInt(currentURL.split('sid=')[1]) + 1) : 0);
                                
                                // Do not keep clicking the "Back" button until the correct URL is loaded (like we do with other submits) so that we don't accidentally go back multiple pages.
                                await webDriver.wait(
                                    until.elementLocated(By.xpath('//div[contains(@class,"ifttt-back-button")]/a')), longWaitForElementTime
                                ).then(async thisElement => {
                                    if (debugLogging) console.debug('DEBUG - Clicking Back Button');
                                    if (browserToAutomate == 'safari') {
                                        await webDriver.executeScript('arguments[0].click()', thisElement); // Neither Selenium click() nor sendKeys(Key.ENTER) works for this button in Safari.
                                    } else {
                                        await thisElement.click();
                                    }
                                });

                                let nextExpectedURL = `https://ifttt.com/create/if-receive-a-web-request-then-broadlink?sid=${nextExpectedSID}`;
                                if (debugLogging) console.debug(`\nDEBUG - Waiting for URL: ${nextExpectedURL}`);
                                while ((currentURL.includes('sid=') ? parseInt(currentURL.split('sid=')[1]) : -1) < nextExpectedSID) {
                                    currentURL = await webDriver.getCurrentUrl();
                            
                                    if (currentURL.startsWith('https://ifttt.com/create/connect-')) {
                                        throw '"BroadLink Service" NOT CONNECTED IN IFTTT';
                                    }
                            
                                    await webDriver.sleep(waitForCorrectUrlSleepInLoopTime);
                                }
                                if (debugLogging) {
                                    console.debug(`DEBUG - Exited Waiting for URL Loop: ${currentURL}\n`);
                                    if (nextExpectedURL != currentURL) console.warn('DEBUG WARNING - EXIT URL DID NOT EQUAL EXPECTED URL\n');
                                }
                                
                                await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Choose action"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
                                
                                await click_button_until_sid_incremented(
                                    'Scene Control Action',
                                    By.xpath('//span[text()="Scene control"]/parent::li'),
                                    ((browserToAutomate == 'safari') ? clickMethodJS : clickMethodSelenium),
                                    'https://ifttt.com/create/if-receive-a-web-request-then-scene-control'
                                );

                                await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Complete action fields"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
                            }
                        } else {
                            console.info('\nCHOSE NOT TO DETECT DEVICES IN BROADLINK');
                        }

                        currentBroadLinkSceneNamesArray = [];

                        if (optionsPromptsResponse.groupSelection != groupDevicesOnly) {
                            await webDriver.wait(until.elementLocated(By.xpath('//select[@name="fields[deviceinfo]"]/option[text()!="Loading…"]')), longWaitForElementTime); // Wait for scenes to be loaded.
                            
                            await webDriver.wait(
                                until.elementsLocated(By.xpath('//select[@name="fields[deviceinfo]"]/option')), longWaitForElementTime // Now get all the scenes.
                            ).then(async theseElements => {
                                if (debugLogging) console.debug('DEBUG - Retrieving BroadLink Scene Names');
                                for (let thisElementIndex in theseElements) {
                                    currentBroadLinkSceneNamesArray.push(await theseElements[thisElementIndex].getText());
                                }
                            });
                        
                            if ((currentBroadLinkSceneNamesArray.length == 1) && (currentBroadLinkSceneNamesArray[0] == 'Options Unavailable')) currentBroadLinkSceneNamesArray = [];
                            if (currentBroadLinkSceneNamesArray.length > 1) {
                                currentBroadLinkSceneNamesArray.sort(function(thisSceneName, thatSceneName) {
                                    return thisSceneName.localeCompare(thatSceneName);
                                });
                            }

                            console.info(`\n${currentBroadLinkSceneNamesArray.length} BroadLink Scene${((currentBroadLinkSceneNamesArray.length == 1) ? '' : 's')} Detected`);
                        } else {
                            console.info('\nCHOSE NOT TO DETECT SCENES IN BROADLINK');
                        }
                        
                        break;
                    } catch (retrieveDevicesAndScenesError) {
                        if (retrieveDevicesAndScenesError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                            throw retrieveDevicesAndScenesError; // Don't keep trying if service isn't connected.
                        }

                        console.error(`\nERROR: ${retrieveDevicesAndScenesError}`);
                        if (debugLogging) {
                            try {
                                console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                            } catch (getCurrentURLerror) {
                                console.debug('FAILED TO GET CURRENT URL');
                            }
                        }
                        console.error(`\n\nERROR RETRIEVING BROADLINK DEVICES AND SCENES - ATTEMPT ${retrieveDevicesAndScenesAttemptCount} OF ${maxTaskAttempts}\n\n`);
                        
                        if (retrieveDevicesAndScenesAttemptCount == maxTaskAttempts) {
                            throw retrieveDevicesAndScenesError;
                        }
                    }
                }
            }

            if (optionsPromptsResponse.taskSelection == taskCreateApplets) {
                let currentBroadLinkDevicesAndScenesArrays = [currentBroadLinkDeviceNamesArray, currentBroadLinkSceneNamesArray];

                for (let thisArrayIndex in currentBroadLinkDevicesAndScenesArrays) {
                    let thisDevicesOrScenesArray = currentBroadLinkDevicesAndScenesArrays[thisArrayIndex];
                    let isScene = (thisArrayIndex == 1);
                    
                    if (thisDevicesOrScenesArray.length > 0) console.info(`\n\nCreating Webhooks Applet${((thisDevicesOrScenesArray.length == 1) ? '' : 's')} for ${thisDevicesOrScenesArray.length} BroadLink ${isScene ? 'scene' : 'device'}${((thisDevicesOrScenesArray.length == 1) ? '' : 's')}...`);

                    for (let thisDeviceOrSceneIndex in thisDevicesOrScenesArray) {
                        let thisDevicOrSceneName = thisDevicesOrScenesArray[thisDeviceOrSceneIndex];
                        
                        let statesArray = (isScene ? ['Scene'] : ['On', 'Off']);
                        for (let thisStateIndex in statesArray) {
                            let thisStateName = statesArray[thisStateIndex];

                            if (isScene) {
                                console.info(`\nSCENE ${parseInt(thisDeviceOrSceneIndex) + 1} OF ${thisDevicesOrScenesArray.length}`);
                                console.info(`\tScene Name: ${thisDevicOrSceneName}`);
                            } else {
                                console.info(`\nDEVICE ${parseInt(thisDeviceOrSceneIndex) + 1} OF ${thisDevicesOrScenesArray.length} - ${thisStateName} STATE`);
                                console.info(`\tDevice Name: ${thisDevicOrSceneName}`);
                            }

                            let thisWebhooksEventName = `BroadLink-${thisStateName}+${thisDevicOrSceneName.replace(/\s/g, '_')}`;
                            
                            let correctOriginalAppletTitle = `If Maker Event "${thisWebhooksEventName}", then ${(isScene ? `the ${thisDevicOrSceneName} will turn on` : `turn ${thisStateName.toLowerCase()} ${thisDevicOrSceneName}`)}`;
                            let desiredAppletTitle = `Webhooks Event: ${thisWebhooksEventName}`;

                            if (existingWebhooksBroadLinkAppletNames.includes(desiredAppletTitle)) {
                                console.info(`SKIPPING: WEBHOOKS APPLET WITH NAME "${desiredAppletTitle}" ALREADY EXISTS`);
                                continue;
                            }

                            for (let appletSetupAttemptCount = 1; appletSetupAttemptCount <= maxTaskAttempts; appletSetupAttemptCount ++) {
                                // If any error happen within the Applet setup phase, we can just start over and try again because the Applet has not been created yet.
                                try {
                                    await setup_ifttt_webhooks_broadlink_applet(thisWebhooksEventName, isScene);
                                    
                                    await webDriver.wait(
                                        until.elementLocated(By.xpath(`//select[@name="fields[deviceinfo]"]/option[text()="${thisDevicOrSceneName}"]`)), longWaitForElementTime
                                    ).then(async thisElement => {
                                        if (debugLogging) console.debug(`DEBUG - Clicking ${isScene ? 'Scene' : 'Device'} Name Option`);
                                        await thisElement.click();
                                    });

                                    if (!isScene) {
                                        await webDriver.wait(
                                            until.elementLocated(By.xpath('//select[@name="fields[PowerControl_ChangePowerState_string]"]/option[2]')), longWaitForElementTime // Always wait for device states to get loaded.
                                        ).then(async thisElement => {
                                            if (thisStateName == 'Off') { // But we only need to click to set the state if we want to change it to "Off".
                                                if (debugLogging) console.debug('DEBUG - Clicking Device State Off Option');
                                                await thisElement.click();
                                            }
                                        });
                                    }
                                    
                                    await click_button_until_sid_incremented(
                                        'Create Action',
                                        By.xpath('//input[@value="Create action"]'),
                                        ((browserToAutomate == 'safari') ? clickMethodEnter : clickMethodSelenium),
                                        `https://ifttt.com/create/if-receive-a-web-request-then-${isScene ? 'scene-control' : 'turn-device-on-or-off'}`
                                    );
                                    
                                    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Review and finish"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
                                    
                                    let originalAppletTitle = 'FAILED_TO_RETRIEVE_ORIGINAL_APPLET_TITLE';

                                    await webDriver.wait(
                                        until.elementLocated(By.tagName('textarea')), longWaitForElementTime
                                    ).then(async thisElement => {
                                        originalAppletTitle = await thisElement.getText();
                                        
                                        if (originalAppletTitle != correctOriginalAppletTitle) {
                                            throw `ORIGINAL APPLET TITLE NOT CORRECT ("${originalAppletTitle}" != "${correctOriginalAppletTitle}")`;
                                        }
                                        
                                        await thisElement.clear();
                                        await thisElement.sendKeys(Key.ENTER, Key.BACK_SPACE); // Send Enter and then Backspace keys be sure the contents get updated, because the character count doesn't always get updated when only using clear().
                                        await thisElement.clear(); // clear() again after that to be sure the title field is empty.
                                        
                                        await thisElement.sendKeys(desiredAppletTitle);
                                        
                                        console.info(`\tOriginal Applet Title: ${originalAppletTitle}`);
                                    });
                                    
                                    try {
                                        // Seen that this can error, but the next check that notifications are actually disabled can still pass. So just log the error and continue. If they're really not disabled the next check will error out.
                                        await webDriver.wait(
                                            until.elementLocated(By.xpath('//div[@class="switch-ui "]/parent::div[@class="switch"]/parent::div[@class="notification"]')), longWaitForElementTime // Disable notifications when Applet runs.
                                        ).then(async thisElement => {
                                            if (debugLogging) console.debug('DEBUG - Clicking Disable Notification Toggle');
                                            if (browserToAutomate == 'safari') {
                                                await webDriver.executeScript('arguments[0].click()', thisElement); // Neither Selenium click() nor sendKeys(Key.ENTER) works for this button in Safari.
                                            } else {
                                                await thisElement.click();
                                            }
                                        });
                                    } catch (disableNotificationError) {
                                        console.error('\nERROR CLICKING DISABLE NOTIFICATIONS TOGGLE - BUT IF APPLET CREATION CONTINUES, NOTIFICATIONS ACTUALLY ARE DISABLED\n');
                                    }
                                    
                                    await webDriver.wait(until.elementLocated(By.xpath('//div[@class="notification"]/div[@class="switch"]/div[@class="switch-ui disabled"]')), longWaitForElementTime); // Make sure notifications when Applet runs got disabled.
                                    
                                    break;
                                } catch (appletSetupError) {
                                    if (appletSetupError.toString().endsWith('NOT CONNECTED IN IFTTT')) {
                                        throw appletSetupError; // Don't keep trying if service isn't connected.
                                    }

                                    console.error(`\nERROR: ${appletSetupError}`);
                                    if (debugLogging) {
                                        try {
                                            console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                                        } catch (getCurrentURLerror) {
                                            console.debug('FAILED TO GET CURRENT URL');
                                        }
                                    }
                                    console.error(`\n\nERROR SETTING UP WEBHOOKS APPLET FOR "${thisWebhooksEventName}" - ATTEMPT ${appletSetupAttemptCount} OF ${maxTaskAttempts}\n\n`);
                                    
                                    if (appletSetupAttemptCount == maxTaskAttempts) {
                                        throw appletSetupError;
                                    }
                                }
                            }
                            
                            for (let finishAppletAttemptCount = 1; finishAppletAttemptCount <= maxTaskAttempts; finishAppletAttemptCount ++) {
                                // Do not keep clicking the "Finish" button until the correct URL is loaded (like we do with other submits) so that we don't accidentally create multiple instances of the same Applet.
                                // But, do retry this part maxTaskAttempts times. If there is an issue the large delay between click attempts should help not make duplicates and only catch real issues.

                                try {
                                    let currentURL = await webDriver.getCurrentUrl();
                                    
                                    if (!currentURL.startsWith('https://ifttt.com/applets/')) {
                                        await webDriver.wait(
                                            until.elementLocated(By.xpath('//input[@value="Finish"]')), longWaitForElementTime
                                        ).then(async thisElement => {
                                            if (debugLogging) console.debug('DEBUG - Clicking Finish Applet Button');
                                            if (browserToAutomate == 'safari') {
                                                await thisElement.sendKeys(Key.ENTER); // Selenium click() doesn't work for this button in Safari.
                                            } else {
                                                await thisElement.click();
                                            }
                                        });
                                        
                                        // But, do keep checking for the "Finish" buttons existance while waiting for the correct URL so we can exit this loop if it's been too long.
                                        let finishButtonExistsCount = 0;
                                        let finishButtonNoLongerExistsCount = 0;

                                        while (!currentURL.startsWith('https://ifttt.com/applets/')) {
                                            try {
                                                await webDriver.wait(until.elementLocated(By.xpath('//input[@value="Finish"]')), shortWaitForElementTime);

                                                finishButtonExistsCount ++;

                                                if (debugLogging) console.debug(`DEBUG - Finish Button Still Exists (${finishButtonExistsCount}) - URL=${currentURL}`);
                                                
                                                if (finishButtonExistsCount >= maxButtonClicksWithIncorrectUrl) {
                                                    if (debugLogging) console.warn('DEBUG WARNING - FINISH BUTTON HAS EXISTED FOR TOO LONG WITHOUT URL GETTING UPDATED - EXITING STUCK LOOP');
                                                    break;
                                                }
                                            } catch (finishButtonExistsError) {
                                                finishButtonNoLongerExistsCount ++;
                                                
                                                if (debugLogging) console.debug(`DEBUG - FINISH BUTTON NO LONGER EXISTS (${finishButtonNoLongerExistsCount}) - URL=${currentURL}`);

                                                if (finishButtonNoLongerExistsCount >= maxIterationsWithIncorrectUrlAfterButtonNoLongerExists) {
                                                    if (debugLogging) console.warn('DEBUG WARNING - FINISH BUTTON HAS NOT EXISTED FOR TOO LONG WITHOUT URL GETTING UPDATED - EXITING STUCK LOOP');
                                                    break;
                                                }
                                            }
                                            
                                            currentURL = await webDriver.getCurrentUrl();
                                            await webDriver.sleep(waitForCorrectUrlSleepInLoopTime);
                                        }
                                    }
                                    
                                    currentURL = await webDriver.getCurrentUrl();

                                    if (currentURL.startsWith('https://ifttt.com/applets/')) {
                                        console.info(`\tEdit Applet URL: ${currentURL}/edit`);
                                        
                                        let finalAppletTitle = 'FAILED_TO_RETRIEVE_FINAL_APPLET_TITLE';
                                        let failedToRetrieveFinalAppletTitleCount = 0;

                                        while (finalAppletTitle == 'FAILED_TO_RETRIEVE_FINAL_APPLET_TITLE') {
                                            try {
                                                await check_for_server_error_page();
                                            } catch (serverError) {
                                                if (checkForServerError.toString().endsWith('NEED TO RELOAD PAGE')) {
                                                    console.error(`\n\nERROR: ${checkForServerError}\n\n`);
                                                    await webDriver.navigate().refresh();
                                                }
                                            }
                                            
                                            try {
                                                await webDriver.wait(
                                                    until.elementLocated(By.xpath('//h1[@class="connection-title"]')), ((failedToRetrieveFinalAppletTitleCount == 0) ? longWaitForElementTime : shortWaitForElementTime)
                                                ).then(async thisElement => {
                                                    if (debugLogging) console.debug('DEBUG - Got Final Applet Title Element');
                                                    finalAppletTitle = await thisElement.getText();
                                                });
                                            } catch (retrieveFinalAppletTitleError) {
                                                failedToRetrieveFinalAppletTitleCount ++;

                                                // Retrieving Final Applet Title can timeout when the web browser window isn't visible, so alert the user.
                                                console.error(`ERROR RETRIEVING FINAL APPLET TITLE (${failedToRetrieveFinalAppletTitleCount}) - MAKE SURE WEB BROWSER WINDOW IS VISIBLE AND UNINTERRUPTED`);

                                                if (failedToRetrieveFinalAppletTitleCount >= maxIterationsWithIncorrectUrlAfterButtonNoLongerExists) {
                                                    if (debugLogging) console.warn('DEBUG WARNING - FAILED TO RETRIEVE FINAL APPLET TITLE TOO MANY TIMES - EXITING STUCK LOOP');
                                                    break;
                                                }
                                            }
                                        }

                                        if (finalAppletTitle != desiredAppletTitle) {
                                            throw `FINAL APPLET TITLE NOT CORRECT ("${finalAppletTitle}" != "${desiredAppletTitle}")`;
                                        }
                                        
                                        console.info(`\tFinal Applet Title: ${finalAppletTitle}`);
                                        console.info(`\tTrigger Applet URL: https://maker.ifttt.com/trigger/${thisWebhooksEventName}/with/key/${iftttWebhooksKey}`);

                                        break;
                                    } else {
                                        throw `FINAL APPLET URL NOT CORRECT "${thisWebhooksEventName}" - URL=${currentURL}`;
                                    }
                                } catch (finishAppletError) {
                                    console.error(`\nERROR: ${finishAppletError}`);
                                    if (debugLogging) {
                                        try {
                                            console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                                        } catch (getCurrentURLerror) {
                                            console.debug('FAILED TO GET CURRENT URL');
                                        }
                                    }
                                    console.error(`\n\nERROR FINISHING WEBHOOKS APPLET FOR "${thisWebhooksEventName}" - ATTEMPT ${finishAppletAttemptCount} OF ${maxTaskAttempts}\n\n`);
                                    
                                    if (finishAppletAttemptCount == maxTaskAttempts) {
                                        throw finishAppletError;
                                    }
                                }
                            }
                        }
                    }
                }
            } else if ((optionsPromptsResponse.taskSelection == taskDeleteApplets) || (optionsPromptsResponse.taskSelection == taskDeleteAppletsNotInBroadLink) || (optionsPromptsResponse.taskSelection == taskOpenEditAppletURLs)) {
                let thisAppletIndex = 0;

                for (let thisAppletID in existingWebhooksBroadLinkAppletIDsAndNames) {
                    let thisAppletName = existingWebhooksBroadLinkAppletIDsAndNames[thisAppletID];
                    let isScene = thisAppletName.startsWith('Webhooks Event: BroadLink-Scene+');
                    
                    if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (isScene && (optionsPromptsResponse.groupSelection == groupScenesOnly)) || (!isScene && (optionsPromptsResponse.groupSelection == groupDevicesOnly))) {
                        if (thisAppletIndex == 0) console.log('\n'); // Just for two line breaks before the first output for this task.
                        
                        thisAppletIndex ++;
                        
                        let thisEditAppletURL = `https://ifttt.com/applets/${thisAppletID}/edit`;
                        
                        if (optionsPromptsResponse.taskSelection == taskOpenEditAppletURLs) {
                            try {
                                exec(`${((process.platform == 'darwin') ? 'open' : ((process.platform == 'win32') ? 'start' : 'xdg-open'))} ${thisEditAppletURL}`);
                                console.info(`${thisAppletIndex} - Opening Edit Webhooks Applet for ${isScene ? 'Scene' : 'Device'} URL: ${thisEditAppletURL} (${thisAppletName})`);
                            } catch (openEditAppletURLerror) {
                                console.error(`${thisAppletIndex} - ERROR OPENING EDIT WEBHOOKS APPLET FOR ${isScene ? 'SCENE' : 'DEVICE'} URL: ${thisEditAppletURL} (${thisAppletName})`);
                                console.error(`ERROR: ${openEditAppletURLerror}\n`);
                            }
                        } else {
                            if (optionsPromptsResponse.taskSelection == taskDeleteAppletsNotInBroadLink) {
                                let thisDeviceOrSceneName = thisAppletName.split('+')[1].replace(/_/g, ' ');
                                
                                if ((!isScene && currentBroadLinkDeviceNamesArray.includes(thisDeviceOrSceneName)) || (isScene && currentBroadLinkSceneNamesArray.includes(thisDeviceOrSceneName))) {
                                    console.info(`${thisAppletIndex} - Not Deleting Webhooks Applet for ${isScene ? 'Scene' : 'Device'} - STILL EXISTS IN BROADLINK: ${thisDeviceOrSceneName} (${thisAppletName})`);
                                    continue;
                                }
                            }

                            for (let deleteAppletAttemptCount = 1; deleteAppletAttemptCount <= maxTaskAttempts; deleteAppletAttemptCount ++) {
                                try {
                                    await webDriver.get(thisEditAppletURL);
                                    await check_for_server_error_page();
                                    
                                    await webDriver.wait(
                                        until.elementLocated(By.xpath('//input[@value="Save"]|//h1[contains(text(),"The requested page or file does not exist.")]')), longWaitForElementTime
                                    ).then(async thisElement => {
                                        if ((await thisElement.getAttribute('value')) == 'Save') {
                                            try {
                                                // Don't wait very long since Save button already exists and Delete button may not exist at all.
                                                // The Delete button should only not exist when visiting an Edit Applet URL which has already been deleted.
                                                // But, that should not really be possible since this code is getting the Edit Applet URLs from what is currently in IFTTT.
                                                // This setup it left over from when this code got the Edit Applet URLs from a file, which weren't guaranteed to not already have been deleted.
                                                // Kept this setup in place to be extra safe, since it could still happen if someone deletes an Applet manually after this delete process was started.
                                                await webDriver.wait(
                                                    until.elementLocated(By.linkText('Delete')), shortWaitForElementTime
                                                ).then(async thatElement => {
                                                    if (browserToAutomate == 'safari') {
                                                        await webDriver.executeScript('arguments[0].click()', thatElement); // Neither sendKeys(Key.ENTER) nor Selenium click() works here in Safari.
                                                    } else {
                                                        await thatElement.click();
                                                    }
                                                    
                                                    await webDriver.switchTo().alert().accept();
                                                    
                                                    let currentURL = await webDriver.getCurrentUrl();
                                                    while ((currentURL != 'https://ifttt.com/') && (currentURL != 'https://ifttt.com/my_applets')) {
                                                        currentURL = await webDriver.getCurrentUrl();
                                                        await webDriver.sleep(waitForCorrectUrlSleepInLoopTime);
                                                    }
                                                    
                                                    console.info(`${thisAppletIndex} - Deleted Webhooks Applet for ${isScene ? 'Scene' : 'Device'}: ${thisEditAppletURL} (${thisAppletName})`);
                                                });
                                            } catch (noDeleteButtonError) {
                                                console.info(`${thisAppletIndex} - Webhooks Applet for ${isScene ? 'Scene' : 'Device'} Already Deleted - NO DELETE BUTTON: ${thisEditAppletURL} (${thisAppletName})`);
                                            }
                                        } else {
                                            console.info(`${thisAppletIndex} - Webhooks Applet for ${isScene ? 'Scene' : 'Device'} Already Deleted - DOES NOT EXIST: ${thisEditAppletURL} (${thisAppletName})`);
                                        }
                                    });
                                    
                                    break;
                                } catch (deleteAppletError) {
                                    console.error(`${thisAppletIndex} - ERROR DELETING WEBHOOKS APPLET FOR ${isScene ? 'SCENE' : 'DEVICE'}: ${thisEditAppletURL} (${thisAppletName})`);
                                    
                                    console.error(`\nERROR: ${deleteAppletError}`);
                                    if (debugLogging) {
                                        try {
                                            console.debug(`URL=${await webDriver.getCurrentUrl()}`);
                                        } catch (getCurrentURLerror) {
                                            console.debug('FAILED TO GET CURRENT URL');
                                        }
                                    }
                                    console.error(`\n\nERROR DELETING WEBHOOKS APPLET - ATTEMPT ${deleteAppletAttemptCount} OF ${maxTaskAttempts}\n\n`);
                                    
                                    if (deleteAppletAttemptCount == maxTaskAttempts) {
                                        throw deleteAppletError;
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (optionsPromptsResponse.taskSelection == taskGenerateHomebridgeIFTTTconfig) {
                let homebridgeIftttConfigPlatformDict = {
                    platform: 'IFTTT',
                    name: 'IFTTT',
                    makerkey: iftttWebhooksKey,
                    accessories: []
                };

                let homebridgeIftttConfigAccessoriesArray = [];
                
                for (let thisAppletNameIndex in existingWebhooksBroadLinkAppletNames) {
                    let thisAppletName = existingWebhooksBroadLinkAppletNames[thisAppletNameIndex];
                    let isScene = thisAppletName.startsWith('Webhooks Event: BroadLink-Scene+');
                    
                    if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (isScene && (optionsPromptsResponse.groupSelection == groupScenesOnly)) || (!isScene && (optionsPromptsResponse.groupSelection == groupDevicesOnly))) {
                        let thisWebhooksEventName = thisAppletName.split('Webhooks Event: ')[1];
                        let thisWebhooksEventNameParts = thisWebhooksEventName.split('+');

                        let thisDeviceOrSceneName = (isScene ? 'Scene - ' : '') + thisWebhooksEventNameParts[1].replace(/_/g, ' ');

                        let thisWebhooksEventState = thisWebhooksEventNameParts[0].split('-')[1];
                        let thisTriggerKey = `trigger${(isScene ? '' : thisWebhooksEventState)}`;

                        let addedThisWebhooksEventNameToExistingAccessory = false;
                        for (let thisAccessoryIndex = (homebridgeIftttConfigAccessoriesArray.length - 1); thisAccessoryIndex >= 0; thisAccessoryIndex --) {
                            if (homebridgeIftttConfigAccessoriesArray[thisAccessoryIndex].name == thisDeviceOrSceneName) {
                                homebridgeIftttConfigAccessoriesArray[thisAccessoryIndex].buttons[0][thisTriggerKey] = thisWebhooksEventName;
                                addedThisWebhooksEventNameToExistingAccessory = true;
                                break;
                            }
                        }

                        if (!addedThisWebhooksEventNameToExistingAccessory) {
                            homebridgeIftttConfigAccessoriesArray.push({
                                name: thisDeviceOrSceneName,
                                buttons: [{
                                    [thisTriggerKey]: thisWebhooksEventName
                                }]
                            })
                        }
                    }
                }

                if (homebridgeIftttConfigAccessoriesArray.length > 0) {
                    homebridgeIftttConfigAccessoriesArray.sort(function(thisAccessory, thatAccessory) {
                        // Sort by names alphabetically with Scenes always on the bottom. Is there a nicer way to correcty sort Scenes onto the bottom?
        
                        let thisAccessoryNameToSort = thisAccessory.name;
                        if (thisAccessoryNameToSort.startsWith('Scene - ')) thisAccessoryNameToSort = `zzzzzzzzzz${thisAccessoryNameToSort}`;
        
                        let thatAccessoryNameToSort = thatAccessory.name;
                        if (thatAccessoryNameToSort.startsWith('Scene - ')) thatAccessoryNameToSort = `zzzzzzzzzz${thatAccessoryNameToSort}`;
        
                        return thisAccessoryNameToSort.localeCompare(thatAccessoryNameToSort);
                    });
        
                    homebridgeIftttConfigPlatformDict.accessories = homebridgeIftttConfigAccessoriesArray;
                }

                let homebridgeIftttConfigPlatformString = JSON.stringify(homebridgeIftttConfigPlatformDict, null, 4);

                console.log(`\n\n${homebridgeIftttConfigPlatformString}\n\n`);
                
                let saveFilePromptResponse = await prompts({
                    type: 'toggle',
                    name: 'saveFile',
                    message: 'Would you like to save the configuration displayed above onto your Desktop?',
                    initial: false,
                    active: 'Save File to Desktop',
                    inactive: "Don't Save File"
                });
                
                if ((Object.keys(saveFilePromptResponse).length == 1) && (saveFilePromptResponse.saveFile == true)) {
                    let desktopPath = path.join(homeDir, 'Desktop');
                    if ((process.platform == 'win32') && !existsSync(desktopPath)) {
                        desktopPath = path.join(homeDir, 'OneDrive', 'Desktop');
                    }
                    
                    let saveFileDate = new Date();
                    let saveFilePath = path.join(desktopPath, sanitizeFilename(`broadlink-webhooks Configuration for homebridge-ifttt (${optionsPromptsResponse.groupSelection}) ${sanitizeFilename(saveFileDate.toLocaleDateString('en-CA'), {replacement: '-'})} at ${sanitizeFilename(saveFileDate.toLocaleTimeString('en-US'), {replacement: '.'})}.json`));
                    
                    try {
                        writeFileSync(saveFilePath, homebridgeIftttConfigPlatformString);
                        console.info(`\nhomebridge-ifttt Configuration File Saved: ${saveFilePath}`);
                    } catch (writeFileError) {
                        console.error(`\nERROR SAVING HOMEBRIDGE-IFTTT CONFIGURATION FILE: ${saveFilePath}\n\nINSTEAD, YOU CAN COPY-AND-PASTE THE CONFIGURATION DISPLAYED ABOVE\n\n${writeFileError}`);
                    }
                } else {
                    console.info(`\nCHOSE NOT TO SAVE HOMEBRIDGE-IFTTT CONFIGURATION FILE\nBut, you can still copy-and-paste the configuration displayed above.`);
                }
            } else if (optionsPromptsResponse.taskSelection == taskGenerateJSON) {
                let jsonDetails = {};

                if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (optionsPromptsResponse.groupSelection == groupDevicesOnly)) {
                    jsonDetails.webhooksBroadLinkOnApplets = [];
                    jsonDetails.webhooksBroadLinkOffApplets = [];
                }
                
                if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (optionsPromptsResponse.groupSelection == groupScenesOnly)) {
                    jsonDetails.webhooksBroadLinkSceneApplets = [];
                }
                
                for (let thisAppletID in existingWebhooksBroadLinkAppletIDsAndNames) {
                    let thisAppletName = existingWebhooksBroadLinkAppletIDsAndNames[thisAppletID];
                    let isScene = thisAppletName.startsWith('Webhooks Event: BroadLink-Scene+');
                    
                    if ((optionsPromptsResponse.groupSelection == groupDevicesAndScenes) || (isScene && (optionsPromptsResponse.groupSelection == groupScenesOnly)) || (!isScene && (optionsPromptsResponse.groupSelection == groupDevicesOnly))) {
                        let thisWebhooksEventName = thisAppletName.split('Webhooks Event: ')[1];
                        
                        let thisAppletDetails = {
                            name: thisAppletName.split('+')[1].replace(/_/g, ' '),
                            appletID: thisAppletID,
                            appletTitle: thisAppletName,
                            webhooksEventName: thisWebhooksEventName,
                            triggerAppletURL: `https://maker.ifttt.com/trigger/${thisWebhooksEventName}/with/key/${iftttWebhooksKey}`,
                            editAppletURL: `https://ifttt.com/applets/${thisAppletID}/edit`
                        };
                        
                        if (isScene) {
                            jsonDetails.webhooksBroadLinkSceneApplets.push(thisAppletDetails);
                        } else {
                            if (thisWebhooksEventName.startsWith('BroadLink-On+')) {
                                jsonDetails.webhooksBroadLinkOnApplets.push(thisAppletDetails);
                            } else {
                                jsonDetails.webhooksBroadLinkOffApplets.push(thisAppletDetails);
                            }
                        }
                    }
                }

                for (let thisAppletGroup in jsonDetails) {
                    jsonDetails[thisAppletGroup].sort(function(thisAppletDetails, thatAppletDetails) {
                        return thisAppletDetails.name.localeCompare(thatAppletDetails.name);
                    });
                }

                let jsonDetailsString = JSON.stringify(jsonDetails, null, 4);

                console.log(`\n\n${jsonDetailsString}\n\n`);
                
                let saveFilePromptResponse = await prompts({
                    type: 'toggle',
                    name: 'saveFile',
                    message: 'Would you like to save the JSON displayed above onto your Desktop?',
                    initial: false,
                    active: 'Save File to Desktop',
                    inactive: "Don't Save File"
                });
                
                if ((Object.keys(saveFilePromptResponse).length == 1) && (saveFilePromptResponse.saveFile == true)) {
                    let desktopPath = path.join(homeDir, 'Desktop');
                    if ((process.platform == 'win32') && !existsSync(desktopPath)) {
                        desktopPath = path.join(homeDir, 'OneDrive', 'Desktop');
                    }
                    
                    let saveFileDate = new Date();
                    let saveFilePath = path.join(desktopPath, sanitizeFilename(`broadlink-webhooks JSON Details (${optionsPromptsResponse.groupSelection}) ${sanitizeFilename(saveFileDate.toLocaleDateString('en-CA'), {replacement: '-'})} at ${sanitizeFilename(saveFileDate.toLocaleTimeString('en-US'), {replacement: '.'})}.json`));
                    
                    try {
                        writeFileSync(saveFilePath, jsonDetailsString);
                        console.info(`\nJSON Details File Saved: ${saveFilePath}`);
                    } catch (writeFileError) {
                        console.error(`\nERROR SAVING JSON DETAILS FILE: ${saveFilePath}\n\nINSTEAD, YOU CAN COPY-AND-PASTE THE JSON DISPLAYED ABOVE\n\n${writeFileError}`)
                    }
                } else {
                    console.info(`\nCHOSE NOT TO SAVE JSON DETAILS FILE\nBut, you can still copy-and-paste the JSON displayed above.`);
                }
            }
            
            let endTime = new Date();
            
            let runTimeMilliseconds = (endTime - startTime);
            let runTimeMinutes = Math.floor(runTimeMilliseconds / 60000);
            let runTimeSeconds = ((runTimeMilliseconds % 60000) / 1000).toFixed(0);
            if (runTimeSeconds == 60) {
                runTimeMinutes ++;
                runTimeSeconds = 0;
            }

            let runTimeDurationString = '';
            if (runTimeMinutes > 0) runTimeDurationString += `${runTimeMinutes} MINUTE${(runTimeMinutes == 1) ? '' : 'S'}`;
            if (runTimeSeconds > 0) {
                if (runTimeDurationString != '') runTimeDurationString += ' ';
                runTimeDurationString += `${runTimeSeconds} SECOND${(runTimeSeconds == 1) ? '' : 'S'}`;
            }
            if (runTimeDurationString != '') runTimeDurationString = ` IN ${runTimeDurationString}`;

            console.info(`\n\nFINISHED "${optionsPromptsResponse.taskSelection}" TASK WITH "${optionsPromptsResponse.groupSelection}"${runTimeDurationString} ON ${endTime.toLocaleString().replace(', ', ' AT ')}\n\n`);
            
            try {
                if (!browserToAutomate.endsWith('-headless') && ((await webDriver.getCurrentUrl()) != 'https://ifttt.com/broadlink')) {
                    await webDriver.get('https://ifttt.com/broadlink');
                }
            } catch (resetToBroadLinkAppletsPageError) {
                // Ignore any error from trying to load BroadLink Applets
            }
        }
    } catch (runtimeError) {
        if (runtimeError.toString() == 'QUIT') {
            userQuit = true;
            console.log(''); // Just for a line break before the next Terminal prompt.
        } else if (runtimeError.toString().includes('geckodriver executable could not be found') || runtimeError.toString().includes('ChromeDriver could not be found')) {
            let errorIsForFirefox = runtimeError.toString().includes('geckodriver');
            let webDriverDownloadURL = (errorIsForFirefox ? 'https://github.com/mozilla/geckodriver/releases/' : 'https://chromedriver.chromium.org/downloads');
            let webDriverExecutableName = (errorIsForFirefox ? 'geckodriver' : 'chromedriver') + ((process.platform == 'win32') ? '.exe' : '');
            let webDriverName = `${errorIsForFirefox ? 'Firefox' : 'Chrome'} WebDriver executable (${webDriverExecutableName})`;

            let installFolderPaths = ((process.platform == 'darwin') ?
                ['/usr/local/bin/'] :
                ((process.platform == 'win32') ?
                    ['C:\\Windows\\', 'C:\\Windows\\System32\\'] :
                    [`${homeDir}/.local/bin/`, '/usr/local/bin/', '/usr/bin/']
                )
            );

            console.error(`\n\nERROR: ${errorIsForFirefox ? 'FIREFOX' : 'CHROME'} WEBDRIVER AUTOMATION IS NOT ENABLED\n\nYou can download the ${webDriverName} from "${webDriverDownloadURL}".\n\nOnce you have downloaded the ${webDriverName}, install it by moving the "${webDriverExecutableName}" file into the "${installFolderPaths.join('" or "')}" folder.\n\nAfter the ${webDriverName} is installed, you can re-launch "broadlink-webhooks" to automate ${errorIsForFirefox ? 'Firefox' : 'Chrome'}.\n\n`);
            
            let openWebDriverDownloadPagePromptResponse = await prompts({
                type: 'toggle',
                name: 'openLink',
                message: `Would you like to open "${webDriverDownloadURL}" in your default web browser?`,
                initial: true,
                active: 'Yes',
                inactive: 'No'
            });
            
            let choseToOpenLink = ((Object.keys(openWebDriverDownloadPagePromptResponse).length == 1) && (openWebDriverDownloadPagePromptResponse.openLink == true));

            if (choseToOpenLink) {
                try {
                    exec(`${((process.platform == 'darwin') ? 'open' : ((process.platform == 'win32') ? 'start' : 'xdg-open'))} ${webDriverDownloadURL}`);
                } catch (openWebDriverDownloadURLerror) {
                    console.error(`ERROR OPENING "${webDriverDownloadURL}": ${openWebDriverDownloadURLerror}`);
                }
            }
            
            let openFolderPromptChoices = ["Don't Open a Folder"];
            for (let thisInstallFolderIndex in installFolderPaths) {
                let thisInstallFolderPath = installFolderPaths[thisInstallFolderIndex];
                openFolderPromptChoices.push({title: `Open "${thisInstallFolderPath}"`, value: thisInstallFolderPath});
            }

            if (openFolderPromptChoices.length > 1) {
                console.log(''); // Just for a line break before the open folder prompt.

                let openFolderPromptResponse = await prompts({
                    type: 'select',
                    name: 'openFolder',
                    message: `Would you like to open ${((openFolderPromptChoices.length > 2) ? 'an' : 'the')} "${webDriverExecutableName}" install location folder${((process.platform == 'darwin') ? ' in Finder' : ((process.platform == 'win32') ? ' in File Explorer' : ''))}?`,
                    choices: openFolderPromptChoices,
                    initial: (choseToOpenLink ? 1 : 0) // Only default to opening a folder if the user chose to open the download URL.
                });

                if (Object.keys(openFolderPromptResponse).length == 1) {
                    try {
                        if (!existsSync(openFolderPromptResponse.openFolder)) { // Should only possibly happen for `${homeDir}/.local/bin/` on Linux.
                            mkdirSync(openFolderPromptResponse.openFolder, {recursive: true});
                        }
                    } catch (makeFolderError) {
                        // Ignore any error making a folder.
                    }
                    
                    try {
                        exec(`${((process.platform == 'darwin') ? 'open' : ((process.platform == 'win32') ? 'start' : 'xdg-open'))} ${openFolderPromptResponse.openFolder}`);
                    } catch (openFolderError) {
                        console.error(`ERROR OPENING "${openFolderPromptResponse.openFolder}": ${openFolderError}`);
                    }
                }
            }

            console.log(''); // Just for a line break before the next Terminal prompt.
        } else if (runtimeError.toString().includes('Develop menu to control Safari via WebDriver')) {
            console.error(`\n\nERROR: SAFARI WEBDRIVER AUTOMATION IS NOT ENABLED\n\nTo enable Safari WebDriver and allow Safari to be automated by "broadlink-webhooks", you must first make sure the "Develop" menu is enabled in Safari's menubar by turning on the "Show Develop menu in menubar" checkbox option in Safari's Advanced Preferences.\n\nThen, in the "Develop" menu in the Safari's menubar, turn on the "Allow Remote Automation" menu item option.\n\nAfter "Allow Remote Automation" is enabled in Safari's "Develop" menu, you can re-launch "broadlink-webhooks" to automate Safari.\n\n`);
        } else {
            console.error(`\nERROR: ${runtimeError}`);
            console.error('\n\nRUNTIME ERROR OCCURRED - RE-LAUNCH BROADLINK-WEBHOOKS TO TRY AGAIN\n\n');
        }
    } finally {
        if (webDriver && (userQuit || browserToAutomate.endsWith('-headless') || !debugLogging)) { // Keep web browser window open if errored with debugLogging enabled and was not headless.
            try {
                await webDriver.quit();
            } catch (quitWebDriverError) {
                // Ignore any error quitting WebDriver.
            }
        }
    }
})();

async function setup_ifttt_webhooks_broadlink_applet(thisWebhooksEventName, isScene) {
    await webDriver.get('https://ifttt.com/create');
    await check_for_server_error_page();

    await webDriver.wait(until.elementLocated(By.xpath('//h1[text()="Create your own"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await click_button_until_sid_incremented(
        'THIS',
        By.className('this-that'),
        clickMethodSelenium,
        'https://ifttt.com/create/if'
    );
    
    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Choose a service"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await webDriver.wait(
        until.elementLocated(By.id('search')), longWaitForElementTime
    ).then(async thisElement => {
        if (debugLogging) console.debug('DEBUG - Entering "Webhooks" into Search Trigger Services Field');
        await thisElement.clear();
        await thisElement.sendKeys('Webhooks');
    });
    
    await click_button_until_sid_incremented(
        'Webhooks Service',
        By.linkText('Webhooks'),
        clickMethodSelenium,
        'https://ifttt.com/create/if-maker_webhooks'
    );
    
    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Choose trigger"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await click_button_until_sid_incremented(
        'Receive a Web Request Trigger',
        By.xpath('//span[text()="Receive a web request"]/parent::li'),
        ((browserToAutomate == 'safari') ? clickMethodJS : clickMethodSelenium),
        'https://ifttt.com/create/if-receive-a-web-request'
    );
    
    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Complete trigger fields"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await webDriver.wait(
        until.elementLocated(By.tagName('textarea')), longWaitForElementTime
    ).then(async thisElement => {
        if (debugLogging) console.debug(`DEBUG - Entering "${thisWebhooksEventName}" into Webhooks Event Name Field`);
        await thisElement.clear();
        await thisElement.sendKeys(thisWebhooksEventName);

        if (!thisWebhooksEventName.startsWith('FakeEventName')) {
            console.info(`\tWebhooks Event Name: ${thisWebhooksEventName}`);
        }
    });

    await click_button_until_sid_incremented(
        'Create Trigger',
        By.xpath('//input[@value="Create trigger"]'),
        ((browserToAutomate == 'safari') ? clickMethodEnter : clickMethodSelenium),
        'https://ifttt.com/create/if-receive-a-web-request-then'
    );
    
    await webDriver.wait(until.elementLocated(By.xpath('//div[@class="if-this-then-that"]/div[@class="subelement"]/span[@class="logo"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await click_button_until_sid_incremented(
        'THAT',
        By.className('this-that'),
        ((browserToAutomate == 'safari') ? clickMethodEnter : clickMethodSelenium),
        'https://ifttt.com/create/if-receive-a-web-request-then'
    );

    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Choose action service"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    await webDriver.wait(
        until.elementLocated(By.id('search')), longWaitForElementTime
    ).then(async thisElement => {
        if (debugLogging) console.debug('DEBUG - Entering "BroadLink" into Search Action Services Field');
        await thisElement.clear();
        await thisElement.sendKeys('BroadLink');
    });
    
    await click_button_until_sid_incremented(
        'BroadLink Service',
        By.linkText('BroadLink'),
        ((browserToAutomate == 'safari') ? clickMethodJS : clickMethodSelenium),
        'https://ifttt.com/create/if-receive-a-web-request-then-broadlink'
    );

    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Choose action"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
    
    if (isScene) {
        await click_button_until_sid_incremented(
            'Scene Control Action',
            By.xpath('//span[text()="Scene control"]/parent::li'),
            ((browserToAutomate == 'safari') ? clickMethodJS : clickMethodSelenium),
            'https://ifttt.com/create/if-receive-a-web-request-then-scene-control'
        );
    } else {
        await click_button_until_sid_incremented(
            'Turn Device On or Off Action',
            By.xpath('//span[text()="Turn device on or off"]/parent::li'),
            clickMethodSelenium,
            'https://ifttt.com/create/if-receive-a-web-request-then-turn-device-on-or-off'
        );
    }

    await webDriver.wait(until.elementLocated(By.xpath('//h2[text()="Complete action fields"]')), longWaitForElementTime); // Make sure correct page is loaded before continuing.
}

async function click_button_until_sid_incremented(buttonName, buttonLocatedBy, clickMethod, nextExpectedURLprefix) {
    // The "buttonName" argument is only important to know whether this is a "Service" page to confirm that it is connected in IFTTT. Otherwise only used for debugging.
    // The "nextExpectedURLprefix" argument is not used for any actual functionality at all (only the URLs "sid" matters) and is only kept around for debugging and sanity checking if things change with IFTTT in the future.

    // Properly handing IFTTT's AJAX page reloads during Applet creation turned out to be a pretty troublesome...
    // Waiting for the next correct URL after clicking a button seems to be a reliable way to ensure that IFTTT's AJAX pages are fully loaded.
    // Only waiting for elements to be located without waiting for the correct URL first will (sometimes/often, on certain pages) fail because (presumably) all of the JavaScript has not loaded yet.
    
    // Clicking the button within the loop that waits for the next correct URL (which should result from clicking that button) seems to be a reliable way to avoid some occasional hangs.
    // To doubly avoid issues where the next page did not get fully loaded, keep clicking the button until it no longer exists and the URL is as expected.
    // Basically, just keep clicking the button as long as it exists and until we get the URL we want.
    // BUT STILL, sometimes the URL just doesn't get updated properly, so if the button has been clicked a bunch (maxButtonClicksWithIncorrectUrl), or if it hasn't existed for a long time (maxIterationsWithIncorrectUrlAfterButtonNoLongerExists), allow the loop to exit with the wrong URL.
    
    // Some page URLs do not change except for the "sid" being incremented.
    // So, instead of waiting for whole URLs, just wait until the URL has the next expected "sid" (or a greater "sid" since sometimes it's higher than expected, maybe because of the way this code keeps clicking buttons to avoid some potentials hangs).
    // Also, only waiting for the "sid" instead of the whole URL can avoid some hanging issues when the "sid" is updated correctly as expected but the rest of the URL is not updated as expected for some reason.
    // For the rare cases where the "sid" is also never updated correctly, but the next page did actually load, the loop will exit with the incorrect URL after the previous page button hasn't existed for a long time as mentioned in the previous comment block.
    
    // Also, remove "footer" tag before trying to click any button because is seems that the "Careers" link can occasionally get clicked.
    // This may happen from a button getting clicked right when the page is being rebuilt and elements are getting moved around.
    // So, remove the footer completely (as well as any other buttons that show up below the ones we want to click) to try to avoid this kind of issue.
    
    let currentURL = await webDriver.getCurrentUrl();

    let elementsToRemoveBy = ((currentURL == 'https://ifttt.com/create') ?
        [By.className('diy-footer'), By.tagName('footer')] : // Only need to try to remove these two on the initial create Applet page since they will then stay removed throughout Applet creation.
        (currentURL.startsWith('https://ifttt.com/create/if-maker_webhooks?') || currentURL.startsWith('https://ifttt.com/create/if-receive-a-web-request-then-broadlink?') ?
            [By.xpath('//div[contains(@class,"platform-suggestion__platform-suggestion")]')] : // This one will get created on these two specified pages during Applet creation.
            [] // Don't bother trying to remove anything on any other pages to save time.
        )
    );
    for (let thisElementToRemoveByIndex in elementsToRemoveBy) {
        try {
            await webDriver.wait(
                until.elementLocated(elementsToRemoveBy[thisElementToRemoveByIndex]), shortWaitForElementTime
            ).then(async thisElement => {
                try {
                    if (debugLogging) console.debug(`DEBUG - Removing Bottom of Page Element with "${await thisElement.getAttribute('className')}" Class on ${currentURL}`);

                    await webDriver.executeScript('arguments[0].remove()', thisElement);
                } catch (innerRemoveFooterError) {
                    // Ignore any stale element error.
                }
            });
        } catch (outerRemoveFooterError) {
            // Ignore likely error from element not existing on this page or from having already been removed.
        }
    }

    let nextExpectedSID = (currentURL.includes('sid=') ? (parseInt(currentURL.split('sid=')[1]) + 1) : 0);
    let nextExpectedURL = `${nextExpectedURLprefix}?sid=${nextExpectedSID}`;

    let buttonClickCount = 0;
    let buttonNoLongerExistsCount = 0;
    
    if (debugLogging) console.debug(`\nDEBUG - Waiting for URL: ${nextExpectedURL}`);

    while (((currentURL.includes('sid=') ? parseInt(currentURL.split('sid=')[1]) : -1) < nextExpectedSID) || (buttonNoLongerExistsCount == 0)) {
        try {
            await webDriver.wait(
                until.elementLocated(buttonLocatedBy), shortWaitForElementTime
            ).then(async thisElement => {
                if ((buttonClickCount == 0) || (buttonNoLongerExistsCount == 0)) { // Only click if not clicked before or button has never NOT existed (preventing clicking if button re-appears after disappearing, which I've seen happen).
                    if (debugLogging) {
                        let thisElementText = await thisElement.getText();
                        console.debug(`DEBUG - Clicking ${buttonName} Button [text="${thisElementText.split('\n')[(thisElementText.startsWith('✚\n') ? 1 : 0)]}", value="${await thisElement.getAttribute('value')}"] (${buttonClickCount + 1}) - SID=${parseInt(currentURL.split('sid=')[1])}`);
                        if ((currentURL.includes('sid=') ? parseInt(currentURL.split('sid=')[1]) : -1) >= nextExpectedSID) console.warn(`DEBUG WARNING - ONLY CHECKING SID WOULD HAVE EXITED LOOP WHILE BUTTON STILL EXISTS (${currentURL})`);
                    }
                    
                    try {
                        if (clickMethod == clickMethodJS) {
                            await webDriver.executeScript('arguments[0].click()', thisElement); // If neither Selenium click() nor sendKeys(Key.ENTER) works for this button.
                        } else if (clickMethod == clickMethodEnter) {
                            await thisElement.sendKeys(Key.ENTER); // If Selenium click() doesn't work for this button.
                        } else {
                            await thisElement.click();
                        }

                        buttonClickCount ++;
                    } catch (innerClickButtonError) {
                        // Ignore likely stale element error and keep looping.
                    }
                } else {
                    buttonClickCount ++;
                    if (debugLogging) console.warn(`DEBUG WARNING - BUTTON REAPPEARED (BUTTON NO LONGER EXISTS COUNT IS ${buttonNoLongerExistsCount}) - NOT CLICKING BUT INCREMENETING CLICK COUNT TO ${buttonClickCount}`);
                }
            });
        } catch (outerClickButtonError) {
            buttonNoLongerExistsCount ++;

            if (debugLogging) console.debug(`DEBUG - BUTTON NO LONGER EXISTS (${buttonNoLongerExistsCount}) - SID=${parseInt(currentURL.split('sid=')[1])}`);

            if (buttonNoLongerExistsCount >= maxIterationsWithIncorrectUrlAfterButtonNoLongerExists) {
                if (debugLogging) console.warn('DEBUG WARNING - BUTTON HAS NOT EXISTED FOR TOO LONG WITHOUT URL GETTING UPDATED - EXITING STUCK LOOP');
                break;
            }
        }

        if (buttonClickCount >= maxButtonClicksWithIncorrectUrl) {
            if (debugLogging) console.warn('DEBUG WARNING - BUTTON HAS BEEN CLICKED TOO MANY TIMES WITHOUT URL GETTING UPDATED - EXITING STUCK LOOP');
            break;
        }

        currentURL = await webDriver.getCurrentUrl();

        if (buttonName.endsWith(' Service') && currentURL.startsWith('https://ifttt.com/create/connect-')) {
            throw `"${buttonName}" NOT CONNECTED IN IFTTT`;
        }

        await webDriver.sleep(waitForCorrectUrlSleepInLoopTime);
    }
    if (debugLogging) {
        console.debug(`DEBUG - Exited Waiting for URL Loop: ${currentURL}\n`);
        if (nextExpectedURL != currentURL) console.warn('DEBUG WARNING - EXIT URL DID NOT EQUAL EXPECTED URL\n');
    }
}

async function check_for_server_error_page() {
    try {
        // Occasionally, IFTTT will hit a 502 error. So try to detect any server error quick to retry more quickly (instead of waiting a long time for an element to not exist).
        await webDriver.wait(until.elementLocated(By.xpath('//center[starts-with(text(),"nginx/")]')), shortWaitForElementTime);
        
        if (debugLogging) console.warn('DEBUG WARNING - "nginx/" FOUND ON LIKELY SERVER ERROR PAGE');

        let serverErrorTitle = 'Unknown Server Error';
        
        try {
            await webDriver.wait(
                until.elementLocated(By.tagName('h1')), shortWaitForElementTime
            ).then(async thisElement => {
                try {
                    serverErrorTitle = await thisElement.getText();
                } catch (innerGetH1error) {
                    // Ignore possible stale element error.
                }
            });
        } catch (outerGetH1error) {
            // Ignore possible error from element not existing.
        }

        throw `HIT "${serverErrorTitle}" - NEED TO RELOAD PAGE`;
    } catch (checkForServerError) {
        if (checkForServerError.toString().endsWith('NEED TO RELOAD PAGE')) {
            throw checkForServerError;
        }
    }
}
