import type { EmployeeListItem } from '@dexa/contracts';
import { Avatar, StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import {
  getEmploymentStatusPresentation,
  getProfileStatusPresentation,
  getRoleLabel,
} from '../utils/employee-status-presentation.js';

const NOT_AVAILABLE_TEXT = 'Not available';

const helper = createDataTableColumnHelper<EmployeeListItem>();

function renderPhoto(
  employee: EmployeeListItem,
  photoThumbnails: ReadonlyMap<string, string> | undefined,
) {
  const thumbnail = photoThumbnails?.get(employee.accountId);
  if (thumbnail === undefined) return <Avatar name={employee.name} />;
  return (
    <Avatar name={employee.name} photoUrl={thumbnail} photoAlt={`Photo of ${employee.name}`} />
  );
}

/**
 * Plain columns with an id and a cell renderer: the list is paged by the server, so no column needs sorting or a
 * value accessor. The photo column takes the thumbnails of this page; a row without one shows initials, and
 * so does every row while the thumbnails are pending or after they failed.
 */
export function createEmployeeListColumns(
  photoThumbnails: ReadonlyMap<string, string> | undefined,
) {
  return helper.columns([
    helper.display({
      id: 'photo',
      header: 'Photo',
      cell: ({ row }) => renderPhoto(row.original, photoThumbnails),
    }),
    helper.display({
      id: 'name',
      header: 'Name',
      cell: ({ row }) => row.original.name,
    }),
    helper.display({
      id: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email ?? NOT_AVAILABLE_TEXT,
    }),
    helper.display({
      id: 'role',
      header: 'Role',
      cell: ({ row }) =>
        row.original.role === null ? NOT_AVAILABLE_TEXT : getRoleLabel(row.original.role),
    }),
    helper.display({
      id: 'position',
      header: 'Position',
      cell: ({ row }) => row.original.position.name,
    }),
    helper.display({
      id: 'employmentStatus',
      header: 'Employment status',
      cell: ({ row }) => {
        const presentation = getEmploymentStatusPresentation(row.original.employeeStatus);
        return <StatusLabel tone={presentation.tone}>{presentation.label}</StatusLabel>;
      },
    }),
    helper.display({
      id: 'profileStatus',
      header: 'Profile status',
      cell: ({ row }) => {
        const presentation = getProfileStatusPresentation(row.original.profileStatus);
        return <StatusLabel tone={presentation.tone}>{presentation.label}</StatusLabel>;
      },
    }),
  ]);
}
