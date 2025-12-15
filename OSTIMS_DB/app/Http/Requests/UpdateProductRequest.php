<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProductRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
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
        $imageFile = $this->file('image');
        logger()->info('[UpdateProductRequest] Validation rules', [
            'route_id' => $this->route('id'),
            'has_file' => $this->hasFile('image'),
            'all_keys' => array_keys($this->all()),
            'files_keys' => array_keys($this->allFiles()),
            'file_object' => $imageFile ? get_class($imageFile) : null,
            'file_size' => $imageFile ? $imageFile->getSize() : null,
            'file_error' => $imageFile ? $imageFile->getError() : null,
            'file_is_valid' => $imageFile ? $imageFile->isValid() : null,
            'file_details' => $this->hasFile('image') ? [
                'name' => $imageFile->getClientOriginalName(),
                'size' => $imageFile->getSize(),
                'mime' => $imageFile->getClientMimeType(),
                'extension' => $imageFile->getClientOriginalExtension(),
            ] : null,
        ]);
        
        return [
            'product_name' => 'required|string|max:255|unique:products,product_name,' . $this->route('id'),
            'price' => 'required|numeric|min:0',
            'category_id' => 'required|exists:categories,id',
            // accept any file without validation
            'image' => 'nullable|image|mimes:jpeg,jpg,png,gif,webp,bmp,svg|max:25600',
            'is_stockable' => 'nullable|boolean',
            'status' => 'nullable|string|in:in_stock,low_stock,out_of_stock,active,archived',
        ];
    }

    public function messages(): array
    {
        return [
            'product_name.required' => 'The product name is required.',
            'product_name.unique' => 'This product name already exists.',
            'price.required' => 'The price is required.',
            'category_id.required' => 'The category is required.',
            'category_id.exists' => 'Selected category does not exist.',
            'image.image' => 'The file must be an image.',
            'image.max' => 'Maximum image size is 25MB.',
        ];
    }
}
