export const lookupProduct = async (barcode) => {

  try {

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
    );

    const data = await res.json();

    if (data.status !== 1) return null;

    const p = data.product;

    return {
      name: p.product_name,
      brand: p.brands,
      category: p.categories,
      image: p.image_url,
      quantity: p.quantity
    };

  } catch (err) {

    console.error("Product lookup failed", err);
    return null;

  }

};