<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCategoryRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Validate category name
            'category' => 'required|string|max:255|unique:categories,category_name,' . $this->route('id'),
        ];
    }

    public function messages(): array
    {
        return [
            'category.required' => 'The category name is required.',
            'category.unique' => 'This category name already exists.',
        ];
    }
}
