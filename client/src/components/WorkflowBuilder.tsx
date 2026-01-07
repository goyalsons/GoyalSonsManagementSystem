import React, { useCallback, useState, useMemo, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
  NodeTypes,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Plus, Save, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Custom Role Node Component
const RoleNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-lg transition-all relative group ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/50"
      }`}
      style={{ minWidth: "180px" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Connection Handles - Top, Bottom, Left, Right - Visible on hover */}
      {/* Each edge has both source and target handles for bidirectional connections */}
      {/* Top Edge - Center */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      {/* Bottom Edge - Center */}
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      {/* Left Edge - Center */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      {/* Right Edge - Center */}
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className={`!w-4 !h-4 !bg-primary !border-2 !border-background hover:!bg-primary/80 hover:!scale-110 transition-all !rounded-full cursor-crosshair z-10 ${
          isHovered ? "!opacity-100" : "!opacity-30"
        }`}
        style={{ pointerEvents: "all" }}
      />

      <div className="flex items-center gap-2 mb-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">{data.name}</div>
          {data.type && (
            <div className="text-xs text-muted-foreground">{data.type}</div>
          )}
        </div>
      </div>
      {data.description && (
        <div className="text-xs text-muted-foreground mt-1">
          {data.description}
        </div>
      )}
      {data.showAddButton && (
        <Button
          size="sm"
          variant="outline"
          className="w-full mt-2 gap-1"
          onClick={data.onAddChild}
        >
          <Plus className="h-3 w-3" />
          Add Role
        </Button>
      )}
    </div>
  );
};

// Node types configuration
const nodeTypes: NodeTypes = {
  roleNode: RoleNode,
};

export interface WorkflowRole {
  id: string;
  name: string;
  description?: string;
  type?: string;
  position?: { x: number; y: number };
}

export interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowData {
  roles: WorkflowRole[];
  connections: WorkflowConnection[];
}

interface WorkflowBuilderProps {
  roles: Array<{
    id: string;
    name: string;
    description?: string;
    level?: number;
    userCount?: number;
  }>;
  initialWorkflow?: WorkflowData;
  onSave?: (workflow: WorkflowData) => Promise<void>;
}

export default function WorkflowBuilder({
  roles,
  initialWorkflow,
  onSave,
}: WorkflowBuilderProps) {
  const { toast } = useToast();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
  const [parentRoleId, setParentRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleType, setNewRoleType] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Convert roles to initial nodes
  const initialNodes: Node[] = useMemo(() => {
    if (initialWorkflow?.roles && initialWorkflow.roles.length > 0) {
      return initialWorkflow.roles.map((role, index) => ({
        id: role.id,
        type: "roleNode",
        position: role.position || {
          x: (index % 4) * 250 + 100,
          y: Math.floor(index / 4) * 150 + 100,
        },
        data: {
          name: role.name,
          description: role.description,
          type: role.type,
          showAddButton: false,
        },
      }));
    }

    // Default layout if no workflow data
    return roles.map((role, index) => ({
      id: role.id,
      type: "roleNode",
      position: {
        x: (index % 4) * 250 + 100,
        y: Math.floor(index / 4) * 150 + 100,
      },
      data: {
        name: role.name,
        description: role.description,
        type: role.level ? `Level ${role.level}` : undefined,
        showAddButton: false,
      },
    }));
  }, [roles, initialWorkflow]);

  const initialEdges: Edge[] = useMemo(() => {
    if (initialWorkflow?.connections && initialWorkflow.connections.length > 0) {
      return initialWorkflow.connections.map((conn) => ({
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: "smoothstep",
        animated: true,
        style: { strokeWidth: 2 },
      }));
    }
    return [];
  }, [initialWorkflow]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle node click
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    // Update nodes to show add button only on selected node
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          showAddButton: n.id === node.id,
        },
      }))
    );
  }, [setNodes]);

  // Handle node double click
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setParentRoleId(node.id);
      setAddRoleDialogOpen(true);
    },
    []
  );

  // Handle connection creation
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      // Check for circular hierarchy
      if (wouldCreateCycle(params.source, params.target, edges)) {
        toast({
          title: "Circular hierarchy detected",
          description: "Cannot create a connection that would create a cycle.",
          variant: "destructive",
        });
        return;
      }

      const newEdge = {
        ...params,
        id: `edge-${params.source}-${params.target}`,
        type: "smoothstep",
        animated: true,
        style: { strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [edges, setEdges, toast]
  );

  // Handle edge click
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null); // Deselect node when edge is selected
  }, []);

  // Handle edge deletion
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    setEdges((eds) => eds.filter((e) => !deletedEdges.find((de) => de.id === e.id)));
    setSelectedEdgeId(null);
    toast({
      title: "Connection removed",
      description: `${deletedEdges.length} connection(s) deleted successfully.`,
    });
  }, [setEdges, toast]);

  // Handle keyboard delete key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEdgeId) {
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        toast({
          title: "Connection removed",
          description: "Connection deleted successfully.",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdgeId, setEdges, toast]);

  // Check if connection would create a cycle
  const wouldCreateCycle = (
    sourceId: string,
    targetId: string,
    currentEdges: Edge[]
  ): boolean => {
    // If target is already an ancestor of source, adding this edge would create a cycle
    const visited = new Set<string>();
    const stack = [targetId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Find all nodes that current points to
      currentEdges
        .filter((e) => e.source === current)
        .forEach((e) => {
          if (e.target) stack.push(e.target);
        });
    }

    return false;
  };

  // Handle add role button click
  const handleAddRoleClick = useCallback((nodeId: string) => {
    setParentRoleId(nodeId);
    setAddRoleDialogOpen(true);
  }, []);

  // Update nodes with add button handlers
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onAddChild: () => handleAddRoleClick(n.id),
        },
      }))
    );
  }, [setNodes, handleAddRoleClick]);

  // Handle create new role
  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim() || !parentRoleId) return;

    const newRoleId = `role-${Date.now()}`;
    const parentNode = nodes.find((n) => n.id === parentRoleId);

    if (!parentNode) return;

    // Create new node
    const newNode: Node = {
      id: newRoleId,
      type: "roleNode",
      position: {
        x: parentNode.position.x,
        y: parentNode.position.y + 150,
      },
      data: {
        name: newRoleName,
        type: newRoleType || undefined,
        showAddButton: false,
        onAddChild: () => handleAddRoleClick(newRoleId),
      },
    };

    // Create connection from parent to new role
    const newEdge: Edge = {
      id: `edge-${parentRoleId}-${newRoleId}`,
      source: parentRoleId,
      target: newRoleId,
      type: "smoothstep",
      animated: true,
      style: { strokeWidth: 2 },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, newEdge]);

    // Reset form
    setNewRoleName("");
    setNewRoleType("");
    setAddRoleDialogOpen(false);
    setParentRoleId(null);

    toast({
      title: "Role added",
      description: `New role "${newRoleName}" has been added to the workflow.`,
    });
  }, [newRoleName, newRoleType, parentRoleId, nodes, setNodes, setEdges, handleAddRoleClick, toast]);

  // Handle save workflow
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      const workflowData: WorkflowData = {
        roles: nodes.map((node) => ({
          id: node.id,
          name: node.data.name,
          description: node.data.description,
          type: node.data.type,
          position: node.position,
        })),
        connections: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target || "",
        })),
      };

      await onSave(workflowData);
      toast({
        title: "Workflow saved",
        description: "Role hierarchy workflow has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Failed to save workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, onSave, toast]);

  if (roles.length === 0 && (!initialWorkflow || initialWorkflow.roles.length === 0)) {
    return (
      <div className="w-full h-[600px] border rounded-lg flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No roles available</p>
          <p className="text-sm mt-2">Create roles first to build a workflow</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        connectionMode="loose"
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          style: { strokeWidth: 2 },
        }}
        edgesUpdatable={false}
        edgesFocusable={true}
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background patternId="grid" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            return node.selected ? "#3b82f6" : "#94a3b8";
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        <Panel position="top-right" className="bg-background/80 backdrop-blur-sm p-2 rounded-lg border flex gap-2">
          {selectedEdgeId && (
            <Button
              onClick={() => {
                setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
                setSelectedEdgeId(null);
                toast({
                  title: "Connection removed",
                  description: "Connection deleted successfully.",
                });
              }}
              size="sm"
              variant="destructive"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Connection
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || !onSave}
            size="sm"
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Workflow"}
          </Button>
        </Panel>
      </ReactFlow>

      {/* Add Role Dialog */}
      <Dialog open={addRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Role</DialogTitle>
            <DialogDescription>
              Create a new role as a child of the selected role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name *</Label>
              <Input
                id="role-name"
                placeholder="Enter role name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-type">Role Type</Label>
              <Select value={newRoleType} onValueChange={setNewRoleType}>
                <SelectTrigger id="role-type">
                  <SelectValue placeholder="Select role type (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddRoleDialogOpen(false);
                setNewRoleName("");
                setNewRoleType("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={!newRoleName.trim()}>
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

