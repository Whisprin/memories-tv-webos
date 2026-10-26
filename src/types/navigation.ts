export type View = 'photos' | 'favorites' | 'albums' | 'people' | 'archive' | 'places';

/** Shared props for every route-level panel mounted by AppLayout. */
export interface RoutePanelProps {
	contentWidth: number;
}
