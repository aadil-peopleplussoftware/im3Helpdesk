using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace iM3Helpdesk.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class KbArticleNullableAuthor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "CreatedByUserId",
                table: "KbArticles",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<string>(
                name: "AuthorType",
                table: "KbArticles",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SystemAuthorLabel",
                table: "KbArticles",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            // Migrate existing bot-authored posts to system attribution, then drop bot users.
            migrationBuilder.Sql(@"
                UPDATE a
                   SET a.AuthorType = 'System',
                       a.SystemAuthorLabel = u.FullName,
                       a.CreatedByUserId = NULL
                  FROM KbArticles a
                  JOIN Users u ON u.Id = a.CreatedByUserId
                 WHERE u.Email LIKE '%bot-%@im3.local';

                DELETE FROM Users WHERE Email LIKE '%bot-%@im3.local';

                UPDATE KbArticles SET AuthorType = 'User' WHERE AuthorType = '';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AuthorType",
                table: "KbArticles");

            migrationBuilder.DropColumn(
                name: "SystemAuthorLabel",
                table: "KbArticles");

            migrationBuilder.AlterColumn<Guid>(
                name: "CreatedByUserId",
                table: "KbArticles",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
