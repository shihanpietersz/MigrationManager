# Local Assets

This directory contains all static assets for the Migration Manager application.
All assets are stored locally to ensure the application works in air-gapped environments
with **zero external network requests**.

## Directory Structure

```
assets/
├── fonts/          # Local font files (woff2 format)
├── images/         # Logo, favicons, and other images
├── icons/          # Custom SVG icons (if needed)
└── README.md       # This file
```

## Fonts

### Inter Font Family

The Inter font is stored locally to avoid any external requests to Google Fonts.

| File | Weight | Usage |
|------|--------|-------|
| `Inter-Regular.woff2` | 400 | Body text |
| `Inter-Medium.woff2` | 500 | Emphasized text |
| `Inter-SemiBold.woff2` | 600 | Subheadings |
| `Inter-Bold.woff2` | 700 | Headings |

**Source:** [rsms/inter](https://github.com/rsms/inter) - SIL Open Font License 1.1

### Adding New Fonts

1. Download the `.woff2` files (preferred format for web)
2. Place them in `assets/fonts/`
3. Update `src/app/layout.tsx` to include the new font:

```tsx
import localFont from 'next/font/local';

const myFont = localFont({
  src: [
    { path: '../../public/assets/fonts/MyFont-Regular.woff2', weight: '400' },
    { path: '../../public/assets/fonts/MyFont-Bold.woff2', weight: '700' },
  ],
  variable: '--font-my-font',
});
```

## Images

Store all images (logos, illustrations, etc.) in `assets/images/`.

### Current Images

| File | Description |
|------|-------------|
| `logo-dark.svg` | Application logo (dark theme) |

### Adding New Images

1. Place the image in `assets/images/`
2. Reference using the public path:

```tsx
import Image from 'next/image';

<Image src="/assets/images/my-image.png" alt="Description" width={100} height={100} />
```

Or in CSS:
```css
background-image: url('/assets/images/my-image.png');
```

## Icons

### Primary Icon System: lucide-react

This application uses [lucide-react](https://lucide.dev/) for icons. This npm package:
- Bundles icons at build time (no external requests)
- Tree-shakes unused icons (optimal bundle size)
- Renders as inline SVG (crisp at any size)

**Usage:**
```tsx
import { Server, Database, Settings } from 'lucide-react';

<Server className="h-5 w-5 text-primary" />
```

### Custom SVG Icons

For icons not available in lucide-react, add custom SVGs to `assets/icons/`:

1. Place the SVG file in `assets/icons/`
2. Import as a component or use with Image:

```tsx
// Option 1: As an image
<Image src="/assets/icons/custom-icon.svg" alt="" width={24} height={24} />

// Option 2: Create a React component (preferred for styling)
// Place in src/components/icons/CustomIcon.tsx
```

## Best Practices

1. **Always use local assets** - Never link to external CDNs
2. **Optimize images** - Use appropriate formats (SVG for icons, WebP/PNG for photos)
3. **Use woff2 for fonts** - Best compression and browser support
4. **Document sources** - Note the license and source for third-party assets

## Verification

To verify no external requests are made:

1. Build the app: `pnpm build`
2. Start in production: `pnpm start`
3. Open browser DevTools → Network tab
4. Refresh and verify no requests to:
   - `fonts.googleapis.com`
   - `fonts.gstatic.com`
   - Any external CDN

## License Information

| Asset | License | Source |
|-------|---------|--------|
| Inter Font | SIL Open Font License 1.1 | [rsms/inter](https://github.com/rsms/inter) |
| Lucide Icons | ISC License | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
