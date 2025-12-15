# Bundle/Combo System Implementation

## Database Changes

I've created a bundle system for your product management. Here's what was added:

### New Tables
1. **product_bundle_items** - Links bundle products with their component products

### New Product Fields
- `is_bundle` (boolean) - Marks if product is a bundle/combo
- `is_stockable` (boolean) - Marks if product requires inventory tracking (default: true)

## How It Works

### Creating a Bundle (e.g., "Egg and Rice Meal")

1. **Create the individual products:**
   - Product 1: "Egg" (is_stockable: true, is_bundle: false)
   - Product 2: "Rice" (is_stockable: false, is_bundle: false)

2. **Create the bundle product:**
   - Product 3: "Egg and Rice Meal" (is_stockable: false, is_bundle: true, price: 50.00)

3. **Add components to the bundle:**
   ```
   POST /api/products/3/bundle-items
   {
     "component_product_id": 1,  // Egg
     "quantity": 2  // 2 eggs per meal
   }
   
   POST /api/products/3/bundle-items
   {
     "component_product_id": 2,  // Rice
     "quantity": 1  // 1 serving of rice
   }
   ```

### When Customer Orders the Bundle

When someone orders "Egg and Rice Meal":
- ✅ Only **stockable** components (Egg) have their inventory deducted
- ✅ **Non-stockable** components (Rice) are recorded in sales but inventory is NOT checked/deducted
- ✅ The full bundle price (₱50) is charged
- ✅ Sales reports show the bundle was sold

## API Endpoints

**Get bundle components:**
```
GET /api/products/{id}/bundle-items
```

**Add component to bundle:**
```
POST /api/products/{id}/bundle-items
Body: { "component_product_id": 1, "quantity": 2 }
```

**Update component quantity:**
```
PUT /api/products/{id}/bundle-items/{componentId}
Body: { "quantity": 3 }
```

**Remove component from bundle:**
```
DELETE /api/products/{id}/bundle-items/{componentId}
```

## Migration Instructions

Run these commands in your OSTIMS_DB directory:

```bash
php artisan migrate
```

This will add the new fields and table to your database.

## Example Use Cases

1. **Meal Combos**: "Egg and Rice", "Burger with Fries", "Breakfast Set"
   - Track stock for main items (egg, burger, fries)
   - Don't track stock for unlimited items (rice, condiments)

2. **Gift Sets**: "Snack Pack", "Drink Combo"
   - Mix stockable and non-stockable items

3. **Promotional Bundles**: "Buy 2 Get 1 Free"
   - Create as a bundle with appropriate pricing

## Next Steps

Would you like me to:
1. Create a UI for managing bundles in the admin panel?
2. Show bundle components on the order page?
3. Update product forms to include bundle/stockable checkboxes?
