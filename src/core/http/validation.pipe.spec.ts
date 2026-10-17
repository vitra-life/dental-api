import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { createValidationPipe } from './validation.pipe.js';

class ItemDto {
  @IsInt()
  quantity: number;
}

class SampleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}

async function validate(value: unknown) {
  return createValidationPipe().transform(value, {
    type: 'body',
    metatype: SampleDto,
  });
}

async function rejection(value: unknown) {
  const error = await validate(value).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
}

describe('createValidationPipe', () => {
  it('returns an instance of the DTO for valid input', async () => {
    const result = await validate({ name: 'x', items: [{ quantity: 1 }] });
    expect(result).toBeInstanceOf(SampleDto);
    expect(result.items[0]).toBeInstanceOf(ItemDto);
  });

  it('lists each invalid field, with a dotted path for nested ones', async () => {
    expect(await rejection({ name: '', items: [{ quantity: 'two' }] })).toEqual(
      {
        message: 'Validation failed',
        details: [
          { field: 'name', errors: ['name should not be empty'] },
          {
            field: 'items.0.quantity',
            errors: ['quantity must be an integer number'],
          },
        ],
      },
    );
  });

  it('rejects fields the DTO does not declare', async () => {
    expect(await rejection({ name: 'x', items: [], is_admin: true })).toEqual({
      message: 'Validation failed',
      details: [
        { field: 'is_admin', errors: ['property is_admin should not exist'] },
      ],
    });
  });
});
