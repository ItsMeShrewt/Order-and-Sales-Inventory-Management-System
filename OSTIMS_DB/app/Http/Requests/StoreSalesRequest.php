<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSalesRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'sale_date' => 'required|date',
            'total_amount' => 'required|numeric|min:0',
            'total_orders' => 'required|integer|min:0',
        ];
    }

    public function messages(): array
    {
        return [
            'sale_date.required' => 'The sale date is required.',
            'sale_date.date' => 'The sale date must be a valid date.',
            'total_amount.required' => 'The total amount is required.',
            'total_amount.numeric' => 'The total amount must be a number.',
            'total_orders.required' => 'The total orders count is required.',
            'total_orders.integer' => 'The total orders must be an integer.',
        ];
    }
}
