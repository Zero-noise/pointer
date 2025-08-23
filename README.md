# AI Text Translator Chrome Extension

A Chrome extension that allows you to translate selected text on webpages using AI API.

## Features

- Floating, draggable translation button in the corner of the page
- Click the button to activate translation mode
- Long-press to drag the button to a new position
- Select text with left mouse button to translate it
- Text is replaced with its translation immediately
- Supports multiple languages
- Uses AI API for high-quality translations
- Customizable API settings (OpenAI by default)

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now be installed and visible in your browser toolbar

## Usage

1. Click on the extension icon in your browser toolbar to open the popup
2. Go to the extension options by clicking "Advanced Settings"
3. Enter your AI API key (OpenAI API key by default)
4. Configure API settings and button position preferences
5. Select the target language for translation in the popup
6. Click "Activate Translation Mode" to enable the translation button
7. On any webpage, click the floating translation button to activate translation mode
8. Select text with your mouse to translate it
9. The selected text will be replaced with its translation
10. Long-press the button to drag it to a new position

## API Key

This extension uses the OpenAI API by default. You need to provide your own API key, which you can get from [OpenAI's website](https://platform.openai.com/).

## Customization

You can modify the following files to customize the extension:

- `manifest.json`: Extension configuration
- `popup.html` and `popup.js`: Quick settings UI
- `options.html` and `options.js`: Advanced settings UI
- `content.js`: Translation functionality and button behavior
- `content.css`: Styling for the translation UI
- `background.js`: API integration

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- This extension uses AI APIs for translations
- Icons and styling inspired by modern UI design patterns 