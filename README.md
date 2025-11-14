# Paperback Extensions

Paperback 0.8 extensions for reading manhwa.

## Available Extensions

### ManhwaRead

Extension for manhwaread.com

## Installation

1. Open Paperback app
2. Go to Settings > Sources > External Sources
3. Add repository URL: `https://github.com/nibysukces/nibysukces-extensions-0.8`
4. Install the extension

## Development

Requirements:

-   Node.js
-   npm

Commands:

```bash
npm install
npm run bundle
npm run serve
```

## Testing

Run tests for ManhwaRead:

```bash
npx tsx src/ManhwaRead/ManhwaRead.test.ts <manga-id> <chapter-id>
```

Example:

```bash
npx tsx src/ManhwaRead/ManhwaRead.test.ts someone-stop-her 01
```

## License

GPL-3.0-or-later
