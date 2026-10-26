import {useRepositoryQuery} from './queryConfig';

export const useFolderRoot = () => useRepositoryQuery(['folder-root'], (r) => r.getFolderRoot());

export const useSubfolders = (path: string | null) =>
	useRepositoryQuery(['folders', path], (r) => r.getSubfolders(path!), {enabled: path !== null});
