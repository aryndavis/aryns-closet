# Aryn’s Closet ♡

A Y2K, Bratz-meets-scrapbook digital closet. Upload outfit photos and they become a lookbook. Each fully visible piece of clothing is automatically cut out into a sticker and cataloged in your closet. The outfit roulette shuffles those pieces into new looks.

- **Lookbook:** outfit photos as taped-in polaroids, grouped into monthly scrapbook spreads with ransom-note headings.
- **Clothing scanner:** finds tops, bottoms, dresses, shoes and accessories in a photo, cuts each one out as a transparent sticker, and names its color.
  - Anything cut off at the photo's edge or mostly hidden gets a dismissible error popup instead of being cataloged. The full photo still goes in the lookbook.
  - Runs entirely in your browser (see below).
- **Review before saving:** fix categories (the scanner can't tell a jacket from a top), rename pieces, skip any, or say "this is already in my closet" to tag an existing item instead of duplicating it.
- **Closet:** every piece as a sticker, filtered by category, with how many times you've worn it.
- **Outfit roulette:** a random top + bottom (or dress) + shoes, optionally with a jacket and an accessory. Lock pieces you like and shuffle the rest.

Built with React, TypeScript and Vite. Uses [Supabase](https://supabase.com) for login, data and private photo storage, and [Transformers.js](https://github.com/huggingface/transformers.js) for on-device clothing segmentation.

## Run it

Requires Node.js LTS and npm.

```sh
npm install
npm run dev       # http://localhost:5174
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

The first `dev` or `build` runs `scripts/fetch-model.mjs`. It downloads the clothing model (about 15 MB) from Hugging Face at a pinned revision, checks each file's SHA-256, and copies the ONNX Runtime WebAssembly files into `public/`. Both folders are gitignored.

Without Supabase settings, the app runs in **demo mode**: photos are saved only in that browser (IndexedDB).

## Supabase setup (one time)

1. Create a new Supabase project.
2. **SQL Editor → New query:** paste in [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates the `outfits`, `items` and `outfit_items` tables and a **private** `closet` storage bucket, with Row Level Security so each user can only reach their own rows and photos (stored under `<user id>/…`).
3. **Authentication → Users → Add user:** create your account, with **Auto Confirm User** checked.
4. **Authentication → Sign In / Providers:** turn **off** “Allow new users to sign up”.
5. Copy `.env.example` to `.env.local` and fill in the **Project URL** and **publishable key**.

Never put the secret / `service_role` key in this app or repo.

## How the clothing scanner works

- **Model:** [`Xenova/segformer_b0_clothes`](https://huggingface.co/Xenova/segformer_b0_clothes), an ONNX conversion of [`mattmdjaga/segformer_b0_clothes`](https://huggingface.co/mattmdjaga/segformer_b0_clothes). It runs in a Web Worker with ONNX Runtime Web (WebAssembly, CPU).
- **Privacy:** photos are never sent anywhere for analysis.
- **How it works:**
  - The model labels every pixel (upper clothes, pants, skirt, dress, shoes, hat, bag, scarf, belt, sunglasses…).
  - Labels are grouped into closet categories, and stray specks are removed.
  - Each piece is checked: anything that touches the photo's edge is "cut off", and anything below a minimum size is "too small or mostly hidden".
  - Shoes are ignored when the legs run off the bottom of the photo, since the model sometimes mistakes bags or cameras for shoes.
- **Color:** the main color comes from the item's pixels, ignoring shadows, and is matched to a friendly name.
- **Tuning:** thresholds live at the top of [`src/vision/worker.ts`](src/vision/worker.ts).
- **Limits:** the model can't distinguish a jacket from a top and may merge layered tops, so the review step lets you fix that. It works best on clear, full-length photos.
- **License:** the model's license is listed as “other” on Hugging Face. Check its terms if this project is ever used beyond personal use.

## Security

- **Row Level Security** on every table and on the storage bucket: only the signed-in owner can read, add or delete their outfits, items and photos. Signed-out visitors get nothing. The policies were tested against Postgres (20 checks).
- **Photos:** stored in a private bucket and shown through short-lived signed URLs. Photos are re-encoded before upload, which strips EXIF metadata such as GPS location, and are capped at 1600px.
- **Content Security Policy:** the app may only load its own files and talk to your Supabase project.
  - `'wasm-unsafe-eval'` allows compiling the model's WebAssembly; JavaScript `eval` is still blocked.
  - The scanner's worker can only fetch the three known model files.
  - `npm run build` writes these headers to `dist/_headers` for hosts that read that file (Cloudflare Pages, Netlify).
- **Pinned downloads:** model files are pinned by revision and SHA-256. The ONNX Runtime files come from the locked npm package.

## Ideas for later

- A smarter vision option (for example a vision LLM) that tells jackets from tops and writes descriptions.
- Seasons and occasions for the outfit roulette, and saving favorite combos.
- An "I wore this today" button that logs an outfit without a new photo.
