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

        // An Admin opens every company without being given it.
        abort_unless($user->canOpenEntity($entity->id), 403);

        $entityContext->set($entity);

        return back();
    }
}
