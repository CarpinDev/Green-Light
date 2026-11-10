import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { type SettingsView, SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<SettingsView> {
    return this.settings.get();
  }

  /** Acepta cualquiera de los 4 umbrales y devuelve los 4 ya actualizados. */
  @Patch()
  update(@Body() dto: UpdateSettingsDto): Promise<SettingsView> {
    return this.settings.update(dto);
  }
}
