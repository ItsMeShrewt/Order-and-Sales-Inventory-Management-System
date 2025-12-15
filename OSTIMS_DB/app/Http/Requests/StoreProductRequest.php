<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // Set to true to allow all users to make this request
    }

    /**
     * Prepare the data for validation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('product_name')) {
            $this->merge([
                'product_name' => ucfirst($this->product_name),
            ]);
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'product_name' => 'required|string|unique:products,product_name',
            'price' => 'required|numeric',
            'category_id' => 'required|exists:categories,id',
            // accept any file without validation - max in KB (25600 KB = 25 MB)
            'image' => 'nullable|image|mimes:jpeg,jpg,png,gif,webp,bmp,svg|max:25600',
            'is_stockable' => 'nullable|boolean',
        ];
    }

    /**
     * Optional: customize validation messages
     */
    public function messages(): array
    {
        return [
            'product_name.required' => 'Product name is required.',
            'product_name.unique' => 'This product already exists.',
            'price.required' => 'Price is required.',
            'price.numeric' => 'Price must be a number.',
            'category_id.required' => 'Category is required.',
            'category_id.exists' => 'Selected category does not exist.',
            'image.image' => 'Uploaded file must be an image.',
            'image.max' => 'Image size must not exceed 25MB.',
        ];
    }
}
