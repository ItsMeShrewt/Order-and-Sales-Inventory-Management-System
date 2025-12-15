<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
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
            'order_date' => 'required|date',
            'order_items' => 'required|array|min:1',
            'order_items.*.product_id' => 'required|exists:products,id',
            'order_items.*.quantity' => 'required|integer|min:1',
            'order_items.*.price' => 'nullable|numeric|min:0',
            'order_items.*.category_id' => 'nullable|exists:categories,id',
            'order_items.*.notes' => 'nullable|string|max:500',
            'order_items.*.cookingPreferences' => 'nullable|array',
        ];
    }

    public function messages(): array
    {
        return [
            'order_date.required' => 'The order date is required.',
            'order_date.date' => 'The order date must be a valid date.',
            'total_amount.required' => 'The total amount is required.',
            'total_amount.numeric' => 'The total amount must be a number.',
            'total_amount.min' => 'The total amount must be at least 0.',
        ];
    }
}
