import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PhotoThumbnailResponse } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchEmployeePhotoThumbnails } from '../api/fetch-employee-photo-thumbnails.js';

// A thumbnail changes only when the employee's photo changes, so a loaded page is not refetched for an hour.
const PHOTO_THUMBNAIL_STALE_TIME_MS = 60 * 60 * 1000;

type UseEmployeePhotoThumbnailsOptions = {
  /** The account IDs of the rows on screen. Sorted here, so the same set of rows always gets the same key. */
  accountIds: ReadonlyArray<string>;
  /** False while the list is still showing the previous page, so no request names rows that are going away. */
  isEnabled: boolean;
};

export type EmployeePhotoThumbnails = ReadonlyMap<string, string>;

function toThumbnailMap(response: PhotoThumbnailResponse): EmployeePhotoThumbnails {
  return new Map(response.items.map((item) => [item.accountId, item.thumbnail]));
}

/**
 * One batched request for the photos of the rows on the current page (D-57). The list never waits for it, and a
 * failed request is not an error for the table: rows without a thumbnail show initials.
 */
export function useEmployeePhotoThumbnails({
  accountIds,
  isEnabled,
}: UseEmployeePhotoThumbnailsOptions): UseQueryResult<EmployeePhotoThumbnails, Error> {
  const { apiClient } = useSession();
  const sortedAccountIds = [...accountIds].sort();
  const hasRows = sortedAccountIds.length > 0;
  return useQuery({
    queryKey: employeeQueryKeys.photoThumbnails(sortedAccountIds),
    queryFn: async () => {
      const response = await fetchEmployeePhotoThumbnails(apiClient, {
        accountIds: sortedAccountIds,
      });
      return toThumbnailMap(response);
    },
    enabled: isEnabled && hasRows,
    placeholderData: keepPreviousData,
    staleTime: PHOTO_THUMBNAIL_STALE_TIME_MS,
    retry: false,
  });
}
