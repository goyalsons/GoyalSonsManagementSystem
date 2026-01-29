import type { Express } from "express";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerWorkflowRoutes(app: Express): void {
  // GET /api/roles/workflow - Get role hierarchy workflow
  app.get("/api/roles/workflow", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const workflow = {
        roles: [],
        connections: [],
      };

      res.json(workflow);
    } catch (error) {
      console.error("Get workflow error:", error);
      res.status(500).json({ message: "Failed to get workflow" });
    }
  });

  // POST /api/roles/workflow - Save role hierarchy workflow
  app.post("/api/roles/workflow", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { roles, connections } = req.body;

      if (!roles || !Array.isArray(roles)) {
        return res.status(400).json({ message: "Invalid workflow data: roles array is required" });
      }

      if (!connections || !Array.isArray(connections)) {
        return res.status(400).json({ message: "Invalid workflow data: connections array is required" });
      }

      // Validate workflow structure - check for circular dependencies
      const nodeMap = new Map<string, Set<string>>();
      connections.forEach((conn: any) => {
        if (!nodeMap.has(conn.source)) {
          nodeMap.set(conn.source, new Set());
        }
        nodeMap.get(conn.source)!.add(conn.target);
      });

      const visited = new Set<string>();
      const recStack = new Set<string>();
      
      const hasCycle = (node: string): boolean => {
        if (recStack.has(node)) return true;
        if (visited.has(node)) return false;
        
        visited.add(node);
        recStack.add(node);
        
        const children = nodeMap.get(node) || new Set();
        for (const child of children) {
          if (hasCycle(child)) return true;
        }
        
        recStack.delete(node);
        return false;
      };

      for (const role of roles) {
        if (!visited.has(role.id) && hasCycle(role.id)) {
          return res.status(400).json({ 
            message: "Circular hierarchy detected in workflow. Please fix the connections." 
          });
        }
      }

      const savedWorkflow = {
        roles,
        connections,
        updatedAt: new Date().toISOString(),
      };

      res.json(savedWorkflow);
    } catch (error) {
      console.error("Save workflow error:", error);
      res.status(500).json({ message: "Failed to save workflow" });
    }
  });
}

