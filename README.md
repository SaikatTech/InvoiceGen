# Bramhatech Lab Invoice Studio

A browser-based invoice creator for Bramhatech Lab. It includes the black-and-orange wordmark, faint grid paper, a company profile and signature pad, product and client directories, automatic totals, optional milestone payments, saved invoice history, and direct A4 PDF download.

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

The app is configured with relative asset paths for GitHub Pages project sites. Build the app with GitHub Actions or another static host and publish the generated `dist/client` directory. If using GitHub Pages, set the repository's Pages source to GitHub Actions and deploy the build output.

## Data and PDF

Company settings, signature, products, clients, invoice drafts, and history are stored in the current browser's local storage. Saving a draft or downloading a PDF adds the current client and invoice products to their directories. **Download PDF** creates and downloads the invoice PDF directly. There is no email sending or server-side data storage in this version.
