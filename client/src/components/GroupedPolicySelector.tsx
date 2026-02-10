/**
 * Grouped policy selector for role editor (UI only).
 * Page-level toggles: None | View | Manage (OPTION B). Advanced section for granular checkboxes.
 * Backend remains granular; selection is stored as policy IDs, mapped from page-level intent.
 */
import { useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Layers, Settings2 } from "lucide-react";
import {
  PAGE_IDS,
  PAGE_PERMISSIONS,
  getPageAccess,
  expandSelectionFromPageToggle,
  type PageAccessLevel,
} from "@/lib/page-permissions";
import { POLICY_GROUPS_UI, getGroupPolicyKeys } from "@/lib/policy-groups";
import { ROLE_TEMPLATES, templateKeysToPolicyIds } from "@/lib/role-templates";

export interface PolicyOption {
  id: string;
  key: string;
  description?: string | null;
}

interface GroupedPolicySelectorProps {
  policies: PolicyOption[];
  selectedPolicyIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  disabled?: boolean;
  showTemplates?: boolean;
}

function buildKeyToId(policies: PolicyOption[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of policies) {
    map.set(p.key, p.id);
  }
  return map;
}

function buildIdToKey(policies: PolicyOption[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of policies) {
    map.set(p.id, p.key);
  }
  return map;
}

function keysToIds(keys: string[], keyToId: Map<string, string>): string[] {
  return keys.map((k) => keyToId.get(k)).filter((id): id is string => !!id);
}

export function GroupedPolicySelector({
  policies,
  selectedPolicyIds,
  onSelectionChange,
  disabled = false,
  showTemplates = true,
}: GroupedPolicySelectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const keyToId = useMemo(() => buildKeyToId(policies), [policies]);
  const idToKey = useMemo(() => buildIdToKey(policies), [policies]);

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    selectedPolicyIds.forEach((id) => {
      const key = idToKey.get(id);
      if (key) keys.add(key);
    });
    return keys;
  }, [selectedPolicyIds, idToKey]);

  const setSelectedKeys = (keys: Set<string>) => {
    const ids = keysToIds([...keys], keyToId);
    onSelectionChange(new Set(ids));
  };

  const handlePageLevelChange = (pageId: string, level: PageAccessLevel) => {
    const next = expandSelectionFromPageToggle(pageId, level, selectedKeys);
    setSelectedKeys(next);
  };

  const togglePolicy = (policyId: string, checked: boolean) => {
    const next = new Set(selectedPolicyIds);
    if (checked) next.add(policyId);
    else next.delete(policyId);
    onSelectionChange(next);
  };

  const applyTemplate = (templateId: string) => {
    const template = ROLE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const ids = templateKeysToPolicyIds(
      template.policyKeys,
      policies.map((p) => ({ id: p.id, key: p.key }))
    );
    onSelectionChange(new Set(ids));
  };

  return (
    <div className="space-y-2">
      {showTemplates && (
        <div className="flex items-center gap-2 pb-3 border-b">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium text-muted-foreground">Apply template</Label>
          <Select onValueChange={applyTemplate} disabled={disabled}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Employee / Manager / Admin / Director" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-2">
        {PAGE_IDS.map((pageId) => {
          const page = PAGE_PERMISSIONS[pageId];
          if (!page) return null;
          const currentLevel = getPageAccess(selectedKeys, pageId);

          return (
            <div
              key={pageId}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{page.label}</p>
              </div>
              <RadioGroup
                value={currentLevel}
                onValueChange={(v) => {
                  if (v === "none" || v === "view" || v === "manage")
                    handlePageLevelChange(pageId, v);
                }}
                disabled={disabled}
                className="flex flex-row items-center gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="none" id={`${pageId}-none`} />
                  <Label htmlFor={`${pageId}-none`} className="text-sm cursor-pointer font-normal">
                    None
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="view" id={`${pageId}-view`} />
                  <Label htmlFor={`${pageId}-view`} className="text-sm cursor-pointer font-normal">
                    View
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="manage" id={`${pageId}-manage`} />
                  <Label htmlFor={`${pageId}-manage`} className="text-sm cursor-pointer font-normal">
                    Manage
                  </Label>
                </div>
              </RadioGroup>
            </div>
          );
        })}
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
            {advancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Settings2 className="h-4 w-4" />
            Advanced – granular policies
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border rounded-lg mt-2 p-3 space-y-2 bg-muted/20 max-h-[40vh] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Fine-grained policy checkboxes. Page toggles above set these in bulk.
            </p>
            {POLICY_GROUPS_UI.map((group) => {
              const groupPolicyIds = keysToIds(getGroupPolicyKeys(group), keyToId);
              if (groupPolicyIds.length === 0) return null;

              return (
                <div key={group.id} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pl-2">
                    {group.items.flatMap((item) =>
                      item.policyKeys.map((key) => {
                        const id = keyToId.get(key);
                        if (!id) return null;
                        const policy = policies.find((p) => p.id === id);
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 py-0.5 rounded hover:bg-background/50"
                          >
                            <Checkbox
                              id={`adv-${id}`}
                              checked={selectedPolicyIds.has(id)}
                              onCheckedChange={(checked) =>
                                togglePolicy(id, checked === true)
                              }
                              disabled={disabled}
                            />
                            <Label
                              htmlFor={`adv-${id}`}
                              className="text-xs cursor-pointer font-mono text-muted-foreground"
                            >
                              {policy?.key ?? key}
                            </Label>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
