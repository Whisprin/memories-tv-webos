export type View = 'photos' | 'folders' | 'favorites' | 'albums' | 'people' | 'archive' | 'onthisday' | 'places' | 'map' | 'tags';

/** Shared props for every route-level panel mounted by AppLayout. */
export interface RoutePanelProps {
	contentWidth: number;
}
