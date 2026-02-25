@Controller('projects/:projectId/meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.meetingService.uploadMeeting(projectId, user.userId, file);
  }

  @Post('/process/:id')
process(
  @Param('id') id: string,
  @CurrentUser() user: any,
) {
  return this.meetingService.processMeeting(id, user.userId);
}

}
