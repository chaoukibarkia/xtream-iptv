"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Package,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { useBouquet, useUpdateBouquet } from "@/lib/api/hooks/useBouquets";

export default function EditBouquetPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const bouquetId = parseInt(params.id as string);

  const [name, setName] = useState("");

  const { data: bouquet, isLoading, isError } = useBouquet(bouquetId);
  const updateBouquet = useUpdateBouquet();

  useEffect(() => {
    if (bouquet) {
      setName(bouquet.name);
    }
  }, [bouquet]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Bouquet name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateBouquet.mutateAsync({
        id: bouquetId,
        data: {
          name: name.trim(),
        },
      });
      toast({
        title: "Success",
        description: "Bouquet updated successfully",
      });
      router.push(`/admin/bouquets/${bouquetId}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update bouquet",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !bouquet) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Bouquet not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/bouquets")}>
          Back to Bouquets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/admin/bouquets/${bouquetId}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">Edit Bouquet</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Modify bouquet settings and configuration
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateBouquet.isPending} className="w-full sm:w-auto">
          {updateBouquet.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Bouquet Information</CardTitle>
          <CardDescription>
            Update the basic information for this bouquet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Bouquet Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter bouquet name"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Bouquet Contents</CardTitle>
          <CardDescription>
            Manage streams and users assigned to this bouquet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/bouquets/${bouquetId}`)}
            >
              Manage Streams & Users
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
