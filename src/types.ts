export type Project = { id: string; name: string };
export interface Board {
    id: string;
    projectId?: string;
    name: string;
    lastEdited: string;
    ownerId?: string;
    entities?: any[];
};
