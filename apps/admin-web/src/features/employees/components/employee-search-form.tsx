import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Icon, TextField } from '@dexa/ui';
import {
  employeeSearchFormSchema,
  type EmployeeSearchFormValues,
} from '../types/employee-list-search.schema.js';

type EmployeeSearchFormProps = {
  /** The term in the URL. The box shows it, and it follows the URL when the URL changes (for example Back). */
  searchTerm: string;
  /** Receives the trimmed term. The search runs on submit (Enter or the button), not on each keystroke. */
  onSearch: (searchTerm: string) => void;
};

export function EmployeeSearchForm({ searchTerm, onSearch }: EmployeeSearchFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<EmployeeSearchFormValues>({
    resolver: zodResolver(employeeSearchFormSchema),
    values: { q: searchTerm },
  });

  return (
    <form
      role="search"
      noValidate
      className="employee-search"
      onSubmit={handleSubmit((values) => onSearch(values.q))}
    >
      <TextField
        label="Search by name or email"
        type="search"
        autoComplete="off"
        error={errors.q?.message}
        {...register('q')}
      />
      <Button type="submit">
        <Icon name="search" size="small" />
        Search
      </Button>
    </form>
  );
}
