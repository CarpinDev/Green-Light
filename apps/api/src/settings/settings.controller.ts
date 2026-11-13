import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { type SettingsView, SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() userId: number): Promise<SettingsView> {
    return this.settings.get(userId);
  }

  /** Acepta cualquiera de los 4 umbrales y devuelve los 4 ya actualizados. */
  @Patch()
  update(@CurrentUser() userId: number, @Body() dto: UpdateSettingsDto): Promise<SettingsView> {
    return this.settings.update(userId, dto);
  }
}
