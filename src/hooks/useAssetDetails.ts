import {useRepositoryQuery} from './queryConfig';

// One photo's details for the viewer's info panel; fetched only while the panel is open, and
// kept for the session (a photo's metadata doesn't change while browsing).
export const useAssetDetails = (assetId: string) =>
	useRepositoryQuery(['asset-details', assetId], (r) => r.getAssetDetails(assetId), {staleTime: Infinity, gcTime: 30 * 60 * 1000});
