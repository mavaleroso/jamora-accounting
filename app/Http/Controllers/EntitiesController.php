<?php

namespace App\Http\Controllers;

use App\Models\Entity;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EntitiesController extends Controller
{
    public function switch(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $data = $request->validate([
            'entity_id' => ['required', 'integer', 'exists:entities,id'],
        ]);

        $user = $request->user();
        $entity = Entity::query()
            ->where('id', $data['entity_id'])
            ->where('is_active', true)
            ->firstOrFail();

        $hasAccess = $user->hasRole('Admin')
            || $user->entities()->where('entities.id', $entity->id)->exists();

        abort_unless($hasAccess, 403);

        if ($user->hasRole('Admin') && ! $user->entities()->where('entities.id', $entity->id)->exists()) {
            $user->entities()->attach($entity->id, ['is_default' => false]);
        }

        $entityContext->set($entity);

        return back();
    }
}
