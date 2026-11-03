// =====================================================================
// utils/bundleThumbnail.js
// Bundle ka cover (thumbnail):
//   1. AI se bana cover (customThumbnail, credit wala) ho to wahi
//   2. warna teacher ne jo comic chuna (thumbnailComicId) uska pehla page
//   3. kuch nahi chuna / comic bundle me nahi raha -> pehla comic (pehle jaisa)
// Us comic ka page na ho to bundle ki kisi bhi comic ka page.
// =====================================================================

const idOf = (c) => String(c?._id || c);

// getThumb(comicId) -> us comic ke pehle page ka imageUrl (ya null)
const getBundleThumbnail = (bundle, getThumb) => {
    if (bundle?.customThumbnail) return bundle.customThumbnail;

    const ids = (bundle?.comics || []).map(idOf);
    if (!ids.length) return null;

    const chosen = bundle.thumbnailComicId && ids.includes(idOf(bundle.thumbnailComicId))
        ? idOf(bundle.thumbnailComicId)
        : ids[0];

    return getThumb(chosen) || ids.map(getThumb).find(Boolean) || null;
};

module.exports = { getBundleThumbnail };
