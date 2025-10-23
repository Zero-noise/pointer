# i18n Module Usage Guide

## Overview

The `i18n.js` module provides internationalization (i18n) functionality for the Pointer extension. It's a standalone, reusable module that can be easily maintained and extended.

## Features

- **10 supported languages**: English, Chinese, Japanese, French, German, Spanish, Korean, Portuguese, Russian, Italian
- **Easy integration**: Simple API for applying translations
- **DOM auto-translation**: Automatically updates elements with `data-i18n` attributes
- **Language validation**: Built-in checks for supported languages
- **Fallback support**: Automatically falls back to English if translation is missing

## API Reference

### Core Functions

#### `getSupportedLanguages()`
Returns all supported languages with their metadata.

```javascript
const languages = I18n.getSupportedLanguages();
// Returns: { en: { code: 'en', name: 'English', nativeName: 'English' }, ... }
```

#### `getLanguageDisplayName(langCode)`
Get the native display name for a language code.

```javascript
const name = I18n.getLanguageDisplayName('zh');
// Returns: '中文'
```

#### `isLanguageSupported(langCode)`
Check if a language is supported.

```javascript
const supported = I18n.isLanguageSupported('ja');
// Returns: true
```

#### `setCurrentLanguage(langCode)`
Set the current active language.

```javascript
I18n.setCurrentLanguage('fr');
```

#### `getCurrentLanguage()`
Get the current active language code.

```javascript
const current = I18n.getCurrentLanguage();
// Returns: 'fr'
```

#### `translate(key, lang?)`
Get translation for a specific key.

```javascript
const text = I18n.translate('buttonSave');
// Returns translation in current language

const text = I18n.translate('buttonSave', 'zh');
// Returns translation in specified language
```

#### `getTranslations(lang?)`
Get all translations for a language.

```javascript
const allTranslations = I18n.getTranslations('es');
```

#### `applyTranslations(lang?)`
Apply translations to all DOM elements with `data-i18n` attribute.

```javascript
I18n.applyTranslations('de');
```

#### `generateLanguageOptions(container, itemClassName?)`
Generate language dropdown options dynamically.

```javascript
const dropdown = document.getElementById('languageDropdown');
I18n.generateLanguageOptions(dropdown, 'custom-item');
```

## Usage Examples

### Basic Setup

```html
<!-- Include the i18n module before your main script -->
<script src="i18n.js"></script>
<script src="your-app.js"></script>
```

### Setting Up HTML

```html
<h1 data-i18n="title">Default Title</h1>
<p data-i18n="subtitle">Default subtitle</p>
<button data-i18n="buttonSave">Save</button>
```

### Applying Translations

```javascript
// Initialize with user's preferred language
I18n.setCurrentLanguage('zh');
I18n.applyTranslations('zh');

// Change language dynamically
function changeLanguage(newLang) {
    if (I18n.isLanguageSupported(newLang)) {
        I18n.setCurrentLanguage(newLang);
        I18n.applyTranslations(newLang);
    }
}
```

### Creating Language Selector

```javascript
const languageDropdown = document.getElementById('languageDropdown');

// Generate language options
I18n.generateLanguageOptions(languageDropdown, 'language-option');

// Handle language selection
languageDropdown.addEventListener('click', (e) => {
    if (e.target.dataset.value) {
        const langCode = e.target.dataset.value;
        I18n.setCurrentLanguage(langCode);
        I18n.applyTranslations(langCode);

        // Save preference
        chrome.storage.sync.set({ uiLang: langCode });
    }
});
```

### Programmatic Translation

```javascript
// Get translated text for display
const message = I18n.translate('statusSaveSuccess');
alert(message);

// Get translation in specific language
const chineseMessage = I18n.translate('statusSaveSuccess', 'zh');
```

## Adding New Languages

To add a new language:

1. Add language metadata to `supportedLanguages` object:
```javascript
ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية'
}
```

2. Add translations to `translations` object:
```javascript
ar: {
    title: 'إعدادات المؤشر',
    subtitle: 'تكوين ملحق الترجمة المدعوم بالذكاء الاصطناعي',
    // ... more translations
}
```

## Adding New Translation Keys

To add new translation keys:

1. Add the key to all language objects in the `translations` object
2. Use the key in your HTML with `data-i18n` attribute or call `I18n.translate(key)`

```javascript
// In i18n.js translations object
en: {
    // ... existing keys
    newFeatureTitle: 'New Feature'
},
zh: {
    // ... existing keys
    newFeatureTitle: '新功能'
}
// ... add to all languages
```

```html
<!-- In your HTML -->
<h2 data-i18n="newFeatureTitle">New Feature</h2>
```

## Best Practices

1. **Always validate language codes** before setting them
2. **Use fallback** when translations might be missing
3. **Update all languages** when adding new translation keys
4. **Keep keys descriptive** and consistent across languages
5. **Test with multiple languages** to ensure UI adapts properly

## Migration from Inline Translations

If you're migrating from inline translations:

1. Replace `translations[lang][key]` with `I18n.translate(key, lang)`
2. Replace `applyTranslations(lang)` with `I18n.applyTranslations(lang)`
3. Replace `supportedLanguages` references with `I18n.getSupportedLanguages()`
4. Add `I18n.setCurrentLanguage(lang)` when changing languages

## Module Structure

```
i18n.js
├── supportedLanguages (Object)
│   └── Language metadata
├── translations (Object)
│   └── Translation strings for each language
└── Public API (Object)
    ├── getSupportedLanguages()
    ├── getLanguageDisplayName()
    ├── isLanguageSupported()
    ├── getCurrentLanguage()
    ├── setCurrentLanguage()
    ├── translate()
    ├── getTranslations()
    ├── applyTranslations()
    └── generateLanguageOptions()
```

## Browser Compatibility

The module uses standard JavaScript and DOM APIs, compatible with:
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+

No external dependencies required.
