# broadlink-webhooks

### Create and Manage [IFTTT](https://ifttt.com) Webhooks Applets for [BroadLink](https://www.ibroadlink.com) (Using [Selenium WebDriver](https://www.npmjs.com/package/selenium-webdriver))

# About

`broadlink-webhooks` is a command line tool which automates the creation of IFTTT Applets using the *"Receive a web request"* trigger of the [Webhooks Service](https://ifttt.com/maker_webhooks) and the *"Turn device on or off"* and *"Scene control"* actions of the [BroadLink Service](https://ifttt.com/broadlink). The IFTTT URLs to trigger these Webhooks Applets (`https://maker.ifttt.com/trigger/…`) can then be used as a REST-like API to control BroadLink devices and scenes. `broadlink-webhooks` also makes utilizing these Webhooks Applets for other services (such as HomeKit via [Homebridge](https://homebridge.io) using [homebridge-ifttt](https://www.npmjs.com/package/homebridge-ifttt)) super simple and easy to maintain.

**PLEASE NOTE:** Since the purpose of `broadlink-webhooks` is to create lots of Webhooks Applets, *[IFTTT Pro](https://ifttt.com/plans)* is essentially required to fully utilize `broadlink-webhooks`. For more information, read the *[About IFTTT Pro](#about-ifttt-pro)* section below.

`broadlink-webhooks` is written in [Node.js](https://nodejs.org/en/) and uses Selenium WebDriver to automate the IFTTT website to create Webhooks Applets for every device and scene that you have in the BroadLink app. Since `broadlink-webhooks` retrieves all BroadLink device and scene names from what's listed within the BroadLink Service in IFTTT, you don't need to re-create your existing BroadLink configuration. **Whatever you already have set up in the BroadLink app is what `broadlink-webhooks` will use to create Webhooks Applets in IFTTT.** For more information about what is made available through the BroadLink Service in IFTTT, read the *[About BroadLink Devices and Scenes Detected by `broadlink-webhooks`](#about-broadlink-devices-and-scenes-detected-by-broadlink-webhooks)* section below.

`broadlink-webhooks` creates specifically named Webhooks Applets with Event Names like `BroadLink-State+Some_Device_or_Scene_Name`. For each BroadLink device listed in the *"Turn device on or off"* action of the BroadLink Service in IFTTT, two Webhooks Applets will be created (one for the "On" action and another for the "Off" action). Their Event Names will be like `BroadLink-On+This_Device_Name` and `BroadLink-Off+This_Device_Name` (spaces in your BroadLink device names will be replaced with underscores in these Event Names). For each BroadLink scene listed in the *"Scene control"* action of the BroadLink Service in IFTTT, one Webhooks Applet will be created with an Event Name like `BroadLink-Scene+This_Scene_Name` (again, spaces in your BroadLink scene names will be replaced with underscores in these Event Names). Within IFTTT, each Webhooks Applet made by `broadlink-webhooks` will not keep the default name that IFTTT supplies, they will all be named like `Webhooks Event: BroadLink-State+Some_Device_or_Scene_Name`. For more information about this specific Applet naming in IFTTT, and its importance, read the *[Important Information About How `broadlink-webhooks` Names IFTTT Applets](#important-information-about-how-broadlink-webhooks-names-ifttt-applets)* section below.

To use these Webhooks Applets to turn a BroadLink device on or off or to activate a BroadLink scene, you'll call an IFTTT URL like this:

	https://maker.ifttt.com/trigger/BroadLink-On+This_Device_Name/with/key/YOUR_IFTTT_WEBHOOKS_KEY

# Installation

The `broadlink-webhooks` package is published through [npm](https://www.npmjs.com/package/broadlink-webhooks) and can be installed with the following command:

	sudo npm install -g broadlink-webhooks

*The `npm` command is included in [Node.js](https://nodejs.org/en/download/), which is required to install and run `broadlink-webhooks`.*

**On Windows, the above command should be run *without* `sudo` as just `npm install -g broadlink-webhooks`.**

*Please note, if you do not install "globally" (using the "-g" flag) as shown in the installation command above, the `broadlink-webhooks` command will not be available to run in your Terminal or Command window because of `npm`'s installation behavior.*

After you've installed `broadlink-webhooks`, you'll also need to install a WebDriver executable for your web browser of choice. `broadlink-webhooks` has been tested with and has menu options for Firefox and Chrome. I have not bothered testing or adding menu options for any other web browsers, such as Edge. Safari was previously supported on macOS, but support was removed for Safari in version 1.0.5 since it was not performing reliably when automated with the latest version of the IFTTT website and was not proving to be worth the extra development and testing effort. As of August 2021, I've tested `broadlink-webhooks` on macOS 11 Big Sur, Windows 10 (May 2021 Update, 21H1), and Linux Mint 20.2 Uma using the latest versions of Firefox and Chrome on all OSes.

For Firefox and/or Chrome, you will need to download and install their WebDriver executables manually:

[Firefox WebDriver Download](https://github.com/mozilla/geckodriver/releases/)

[Chrome WebDriver Download](https://chromedriver.chromium.org/downloads)

Once you have downloaded the WebDriver executable of your choice, you must install it by moving the `geckodriver(.exe)` *for Firefox* or `chromedriver(.exe)` *for Chrome* executable file into the a proper installation folder location.

On macOS, the WebDriver executable can be installed into "/usr/local/bin/".

On Windows, the WebDriver executable can be installed into "C:\\Windows\\" or "C:\\Windows\\System32\\".

On Linux, the WebDriver executable can be installed into "~/.local/bin/" or "/usr/local/bin/" or "/usr/bin/".

Or, for more savvy users, any configured Terminal/Command search path will do.

# Usage

After "global" installation via `npm` as shown above, run `broadlink-webhooks` with the following command:

	broadlink-webhooks

*Once you launch `broadlink-webhooks` you'll be presented with a series of prompts to choose what you want to do.*

### First you can choose the web browser you want to automate, the available options are as follows:

* Firefox (Hidden Window / Headless)
* Firefox (Visible Window)
* –
* Chrome (Hidden Window / Headless)
* Chrome (Visible Window)

### Next you can choose the task you want to perform:

* Create Webhooks Applets *(No duplicates will be created for identical Webhooks Applets already created by `broadlink-webhooks`.)*
* Archive Webhooks Applets for Renamed or Archived Devices/Scenes in BroadLink *(For renamed devices/scenes, you can re-run the "Create Webhooks Applets" task after this task is finished.)*
* Archive All Webhooks Applets Created by `broadlink-webhooks` *(If you ever want the Webhooks Applets back after removing them, you can re-run the "Create Webhooks Applets" task at any time.)*
* –
* Output Summary of Webhooks Applets Created by `broadlink-webhooks` and Devices/Scenes in BroadLink
* Generate "[homebridge-ifttt](https://www.npmjs.com/package/homebridge-ifttt)" Configuration for Webhooks Applets Created by `broadlink-webhooks` *(Useful only if you use Homebridge. Visit [homebridge.io](https://homebridge.io) to learn more.)*
* Generate "[homebridge-http-switch](https://www.npmjs.com/package/homebridge-http-switch)" Configuration for Webhooks Applets Created by `broadlink-webhooks` *(Useful only if you use Homebridge and want more customization options than `homebridge-ifttt`. Visit [homebridge.io](https://homebridge.io) to learn more.)*
* Generate JSON Details of Webhooks Applets Created by `broadlink-webhooks` *(Useful for your own custom scripts.)*
* Open All IFTTT Edit URLs for Webhooks Applets Created by `broadlink-webhooks` *(Edit Applet URLs will open in your default web browser. You should be logged in to IFTTT in your default web browser before running this task.)*
* Open `broadlink-webhooks` on GitHub *(To learn more, ask questions, make suggestions, and report issues.)*

### Finally, you can choose whether you want to run the selected task for both BroadLink devices and scenes, or just one or the other.

**Actually finally, you'll be prompted to log in to IFTTT.** You will have the choice of logging in via command line or logging in manually via web browser. When logging in via command line, you will be prompted for your IFTTT username and password which will be entered into the IFTTT website for you. If you have Two-Step Verification enabled in IFTTT, you will be prompted via command line for a two-step verification code (which will also be entered into the IFTTT website for you) before being able to log in. *Logging in via command line is supported by all web browser options (including with hidden windows), but only supports logging in with a regular IFTTT account (including Two-Step Verification).* **To log in to IFTTT using a linked Apple, Google, or Facebook account, you must choose to log in manually via web browser.** *Logging in manually via web browser is only supported when automating Firefox or Chrome with a visible window.* Firefox and Chrome with hidden windows cannot support logging in manually via web browser because there would be no visible window for you to manually log in to. If you choose to log in manually via web browser and previously chose an unsupported web browser option (such as Firefox or Chrome with a hidden window), you will be prompted to change your web browser selection or log in via command line instead (which only supports regular IFTTT accounts).

After the selected task has finished, you will be presented with this same series of prompts again to do another task until you choose to quit `broadlink-webhooks` (a *Quit* option is available in each prompt). If you keep using the same web browser option (and do not disturb the web browser window if you chose it to be visible), you will not need to log in again for subsequent tasks.

As you can see, these tasks are made to help you keep your Webhooks Applets up-to-date with what is currently in the BroadLink app, as things may change over time. If you add any new devices or scenes, you can just re-run the *"Create Webhooks Applets"* task and any Webhooks Applets that already exist will be skipped (no duplicate will be created). If you rename or delete anything in the BroadLink app, you can run the *"Archive Webhooks Applets for Renamed or Deleted Devices/Scenes in BroadLink"* task to remove the old Webhooks Applets while keeping all your other Webhooks Applets intact. If you've just renamed something in the BroadLink app and not completely deleted it, you can re-run the *"Create Webhooks Applets"* task to create the new Webhooks Applets for the renamed devices or scenes.

## About *[IFTTT Pro](https://ifttt.com/plans)*
Since the purpose of `broadlink-webhooks` is to create lots of Webhooks Applets, *[IFTTT Pro](https://ifttt.com/plans)* is essentially required to fully utilize `broadlink-webhooks`. If you **DO NOT** have *[IFTTT Pro](https://ifttt.com/plans)*, will receive an error from `broadlink-webhooks` when you've hit the maximum number of allowed Applets created and `broadlink-webhooks` will no longer be able to create any more Applets or detect devices and scenes in BroadLink (because it needs to go through most of the Applet creation process to detect BroadLink devices and scenes). For `broadlink-webhooks` to be able to create more Applets and detect BroadLink devices and scenes, you will need to purchase *[IFTTT Pro](https://ifttt.com/plans)*. **This is not an endorsement of *[IFTTT Pro](https://ifttt.com/plans)*, just the facts in regards to `broadlink-webhooks` functionality.**

## Creating Lots of Webhooks Applets Is Not Exactly Fast
Because `broadlink-webhooks` is automating the IFTTT website, it's outrageously faster than a human could ever do, but not at all fast in terms of what you may expect from a normal command line tool. For my setup of 94 Webhooks Applets (40 turn device on Applets + 40 turn device off Applets + 14 scene Applets), it takes about 30 minutes to create all the Webhooks Applets. Deleting all 94 Webhooks Applets takes about 5 minutes. This timing was roughly consistent between all OSes and all web browsers tested. **If you have a lot of BroadLink devices and scenes to create Webhooks Applets for, I recommend preventing your computer from sleeping during the creation process so that it is not interrupted.** *If the creation process is interrupted, you can just start over and any Webhooks Applets already created will be skipped.*

On macOS 10.11 or later, I can recommend using the [Amphetamine](https://apps.apple.com/app/id937984704?ls=1&mt=12) app to easily prevent your Mac from sleeping.

On Windows 10, I briefly used the [Caffeine](https://www.zhornsoftware.co.uk/caffeine/) app, but better options may be available.

On Linux Mint, I briefly used a different [Caffeine](https://launchpad.net/caffeine) app, but better options may be available.

## About BroadLink Devices and Scenes Detected by `broadlink-webhooks`

`broadlink-webhooks` can only create Webhooks Applets for BroadLink devices and scenes which are listed within the *"Turn device on or off"* and *"Scene control"* actions of the BroadLink Service in IFTTT. Any device types that are not made available by BroadLink in the *"Turn device on or off"* action of the BroadLink Service in IFTTT will not be detected by `broadlink-webhooks`. None of the other actions available through the BroadLink Service in IFTTT are supported by `broadlink-webhooks` (only the *"Turn device on or off"* and *"Scene control"* actions are supported). If you use Alexa or Google Assistant and your BroadLink devices are available to turn on and off through there, they should be available in IFTTT as well. Personally, all of my RF outlets are setup as a "Bulb" in the BroadLink app, which works perfectly. All BroadLink scenes should be available to IFTTT, as far as I know. It is also worth noting that BroadLink has had a few other apps throughout the years, such as IHC and e-Control. Personally, I have only ever used the latest app which is just called BroadLink, if you use an older app, I'm uncertain whether or not devices and scenes will be available through the BroadLink Service in IFTTT.

## Important Information About How `broadlink-webhooks` Names IFTTT Applets

The specific Applet naming like `Webhooks Event: BroadLink-State+Some_Device_or_Scene_Name` that `broadlink-webhooks` uses is how `broadlink-webhooks` knows that it originally created that Applet. Since `broadlink-webhooks` can also archive Applets in IFTTT, only Webhooks Applets for BroadLink named exactly like this can be archived by `broadlink-webhooks`. If you manually change the name of an Applet what was created by `broadlink-webhooks`, then `broadlink-webhooks` may no longer know it exists and may not be able to archive it. `broadlink-webhooks` may also make a duplicate of the manually renamed Applet the next time the *"Create Webhooks Applets"* task is run. Conversely, if you name your own manually created Webhooks Applets for BroadLink exactly like this, they may be archived by `broadlink-webhooks` when running a archive task. This only applies to Applets which use Webhooks as the Trigger Service and BroadLink as the Action Service, if you name any other Applets in this style which use different a Trigger Service and/or different Action Service, such as `Webhooks Event: Wemo-On+This_Smart_Plug`, that is just fine (I name Webhooks Applets for other services this way myself). What `broadlink-webhooks` checks for exactly is any Applet using Webhooks as the Trigger Service and BroadLink as the Action Service whose name starts with `Webhooks Event: BroadLink-On+` or `Webhooks Event: BroadLink-Off+` or `Webhooks Event: BroadLink-Scene+` and also doesn't have any spaces in the rest of the name.

## BroadLink Takes a Few Seconds to Respond to IFTTT Webhooks Applets

[Other than essentially requiring *IFTTT Pro*](#about-ifttt-pro), the only real downside to this solution is that the time between calling an IFTTT URL to trigger a Webhooks Applet to the BroadLink device or scene responding can take a few seconds (or occasionally a few more). In practice, I don't find the delay to be that bad. When calling a single URL it's often quite quick, but when calling a few URLs in quick succession you may notice a bit more of a delay. You can notice this delay if you observe the time it takes for a device to respond when using the BroadLink app itself, or when using Alexa or Google Assistant. Those techniques take about a second while using IFTTT can take a few seconds. Not a show stopper for me, but you should be aware.

## Background

Sadly, BroadLink does not offer a native REST API for quick and easy URLs to turn devices on and off and activate scenes. While there are a variety of projects out there to workaround this in one way or another, I found many of them to be overly complicated, have drawbacks that I wasn't willing to accept (such as requiring hardware and software to be running all the time and/or needing to re-learn every device separately from what's already setup in the BroadLink app), and did not always support the latest BroadLink devices, app, or cloud service. Personally, I'm pretty new to BroadLink and only have the latest RM4 Pro (which I moved to after Hook Smart Home shut down their service). Once I set up all of my 40 RF outlets and 14 scenes in the BroadLink app, I didn't want to have to re-create all of that again specifically for HomeKit integration using [Homebridge](https://homebridge.io) or to be able to have a simple REST API to control a few devices and scenes with custom [ESP8266](https://en.wikipedia.org/wiki/ESP8266) buttons. And I especially didn't want to have use different solutions for each of those tasks. Lastly, I didn't want to *not* use the latest BroadLink app and cloud service (as some other projects seem to suggest) to manage my devices and scenes because I also wanted the easy Alexa integration and support for future devices and features. Basically, no existing projects that I could find fit exactly what I wanted for Homebridge integration or a REST API. It seemed like using BroadLink's IFTTT integration was the only way forward.

First, I decided to try manually creating Webhooks Applets in IFTTT for all my BroadLink devices. I quickly realized that it would be extremely tedious to create the 80 perfectly named Webhooks Applets that would be required to turn my 40 RF outlets on and off. I could tell that it would be so simple to make some typo or select the wrong device for the wrong Event Name. On top of that, I knew I also wanted to get all my BroadLink devices into HomeKit using [homebridge-ifttt](https://www.npmjs.com/package/homebridge-ifttt) which would require a pretty big configuration file. The idea of having to manually create that as well made the whole process feel even more tedious and error-prone. Obviously, the solution was to spend infinitely more time creating this project!

So, I abandoned the idea of manually creating all these Webhooks Applets and went about automating the IFTTT website to create them all quickly and perfectly as well as being able to automatically generate the [homebridge-ifttt](https://www.npmjs.com/package/homebridge-ifttt) configuration that I knew I would want to have in the end. Having this automated solution would also mean that any changes I make to my BroadLink setup would be easy to keep in sync with the Webhooks Applets as well as the Homebridge configuration. Along the way, I knew others may find this functionality useful and may also want to be able to make their own configurations for other services, so I added an option to output full JSON details of all Webhooks Applets made by `broadlink-webhooks`, which should be simple to parse to generate any other kind of configuration desired. If there are any widely used or desired configurations, I would be happy to work with folks on adding more built-in options to output common configurations in the future.

I hope you find `broadlink-webhooks` as useful as I have. Other than deleting and re-creating my Webhooks Applets a ton of times to test and refine this thing, it has really been a "set it and forget it" kind of thing for Homebridge and my other custom ESP8266 buttons around the house, which is exactly what I was hoping for!
